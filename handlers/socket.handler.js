
const Tft100Framer = require('../protocols/tft100/framer');
const packetHandler = require('./packet.handler');
const deviceManager = require('../services/deviceManagement.service');
const {  CONSTANTS } = require('../constants');

function setupSocket(socket) {
    const socketId = `${socket.remoteAddress}:${socket.remotePort}`;

    // Initialize socket state
    socket.authenticated = false;
    socket.imei = null;
    socket.setKeepAlive(true, CONSTANTS.SOCKET_KEEPALIVE); // 60 seconds
    socket.setTimeout(CONSTANTS.SOCKET_TIMEOUT);

    console.log('[SOCKET] New connection:', socketId);

    // Create framer for this socket
    const framer = new Tft100Framer();

    // Pipe socket data through framer
    socket.pipe(framer);

    // Handle framed packets
    framer.on('data', (packet) => {
        packetHandler.handlePacket(socket, packet);
    });

    // Handle framer errors
    framer.on('error', (err) => {
        console.error('[FRAMER] Error:', err.message);
    });

    // Handle socket timeout
    socket.on('timeout', () => {
        console.warn('[SOCKET] Timeout:', {
            socketId,
            imei: socket.imei,
            authenticated: socket.authenticated
        });

        if (!socket.authenticated) {
            console.warn('[SOCKET] Closing unauthenticated connection due to timeout');
            socket.destroy();
        }
    });

    // Handle socket errors
    socket.on('error', (err) => {
        console.error('[SOCKET] Error:', {
            socketId,
            imei: socket.imei,
            error: err.message
        });
    });

    // Handle socket close
    socket.on('close', () => {
        
        console.log('[SOCKET] Connection closed:', {
            socketId,
            imei: socket.imei,
            authenticated: socket.authenticated
        });

        if (socket.imei) {
            deviceManager.removeConnection(socket);
        }
        
        // Clean up framer
        framer.end();
        framer.destroy();
    });
}

module.exports = setupSocket;
