
const { createProtocolAdapter } = require('../protocols/registry');
const packetHandler = require('./packet.handler');
const deviceManager = require('../services/deviceManagement.service');
const {  CONSTANTS } = require('../constants');

function setupSocket(socket, protocolName = 'tft100') {
    const socketId = `${socket.remoteAddress}:${socket.remotePort}`;

    // Initialize socket state
    socket.authenticated = false;
    socket.imei = null;
    socket.setKeepAlive(true, CONSTANTS.SOCKET_KEEPALIVE);
    socket.setTimeout(CONSTANTS.SOCKET_TIMEOUT);

    // Attach protocol adapter (framer + decoder + encoder)
    socket.protocol = createProtocolAdapter(protocolName);

    console.log('[SOCKET] New connection:', socketId);

    // Pipe socket data through the protocol's framer
    socket.pipe(socket.protocol.framer);

    // Handle framed packets
    socket.protocol.framer.on('data', (packet) => {
        packetHandler.handlePacket(socket, packet);
    });

    // Handle framer errors
    socket.protocol.framer.on('error', (err) => {
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
        } else {
            console.warn('[SOCKET] Closing authenticated connection due to timeout:', socket.imei);
        }
        socket.destroy();
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
        socket.protocol.framer.end();
        socket.protocol.framer.destroy();
    });
}

module.exports = setupSocket;
