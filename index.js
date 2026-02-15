
require('dotenv').config();
const net = require('net');
const {  CONSTANTS } = require('./constants');
const setupSocket = require('./handlers/socket.handler');
const startApiServer = require('./api');
const CronJobScheduler = require('./jobs/cron.job');
const db = require('./db');

// ============================================================================
// SERVER SETUP
// ============================================================================
const server = net.createServer((socket) => {
    setupSocket(socket);
});

// Handle server errors
server.on('error', (err) => {
    console.error('[SERVER] Server error:', err);

    if (err.code === 'EADDRINUSE') {
        console.error(`[SERVER] Port ${CONSTANTS.BROKER_PORT} is already in use`);
        process.exit(1);
    }
});

async function main() {
    // Test DB connection first
    await db.testConnection();

    // Start Cron Jobs
    CronJobScheduler.revertTimedOutIOTCommandsCronjob();

    // Start API
    await startApiServer();

    // Start TCP Server
    server.listen(CONSTANTS.BROKER_PORT, () => {
        console.log('='.repeat(70));
        console.log('  TELTONIKA TFT100 GATEWAY SERVER');
        console.log('='.repeat(70));
        console.log(`  Port: ${CONSTANTS.BROKER_PORT}`);
        console.log(`  Max Connections: ${CONSTANTS.MAX_DEVICE_CONNECTIONS}`);
        console.log(`  Socket Timeout: ${CONSTANTS.SOCKET_TIMEOUT}ms`);
        console.log('='.repeat(70));
        console.log('[SERVER] ✓ Ready to accept connections');
        console.log('');
    });
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
function gracefulShutdown(signal) {
    console.log(`\n[SHUTDOWN] Received ${signal}, closing server...`);

    server.close(() => {
        console.log('[SHUTDOWN] Server closed');

        console.log('[SHUTDOWN] ✓ All connections closed');
        process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('[SHUTDOWN] Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start
main();
