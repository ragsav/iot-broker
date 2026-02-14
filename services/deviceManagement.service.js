class DeviceManager {
    constructor() {
        this.deviceSockets = new Map(); // imei -> socket
        this.socketMetadata = new WeakMap(); // socket -> { imei, connectedAt }
        this.bannedIMEIs = new Set();
        this.activeConnections = 0;
    }

    addConnection(socket, imei) {
        // Disconnect if currently connected
        if (this.deviceSockets.has(imei)) {
            console.warn('[LOGIN] Device already connected, disconnecting old socket:', imei);
            const oldSocket = this.deviceSockets.get(imei);
            oldSocket.destroy();
        }

        socket.imei = imei;
        socket.authenticated = true;
        this.deviceSockets.set(imei, socket);
        this.socketMetadata.set(socket, {
            imei,
            connectedAt: Date.now(),
            remoteAddress: socket.remoteAddress,
            remotePort: socket.remotePort
        });
        
        // Only increment active connections if it's a new socket (handled by server, but tracking here for consistency if needed)
        // Since activeConnections is incremented on connection, we don't double count here ideally, 
        // but for this class let's just track authenticated devices via map size.
    }

    removeConnection(socket) {
        if (socket.imei) {
            this.deviceSockets.delete(socket.imei);
        }
        this.socketMetadata.delete(socket);
    }

    getSocket(imei) {
        return this.deviceSockets.get(imei);
    }

    isBanned(imei) {
        return this.bannedIMEIs.has(imei);
    }

    ban(imei) {
        this.bannedIMEIs.add(imei);
        console.log('[ADMIN] Device banned:', imei);
        const socket = this.deviceSockets.get(imei);
        if (socket) {
            socket.destroy();
        }
    }

    unban(imei) {
        this.bannedIMEIs.delete(imei);
        console.log('[ADMIN] Device unbanned:', imei);
    }

    sendCommand(imei, command) {
        const socket = this.deviceSockets.get(imei);
        if (!socket) {
            console.error('[COMMAND] Device not connected:', imei);
            return false;
        }

        // Note: We need to instantiate Encoder here or pass it in.
        // Assuming Tft100Encoder is available classes
        const Tft100Encoder = require('../protocols/tft100/encoder');
        const encoder = new Tft100Encoder();
        const packet = encoder.encodeCommand(command);

        console.log('[COMMAND] Sending command to device:', { imei, command });
        socket.write(packet);

        return true;
    }

    getStats() {
        return {
            authenticatedDevices: this.deviceSockets.size,
            uptime: process.uptime(),
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
        };
    }
    
    getAllDeviceImies() {
        return Array.from(this.deviceSockets.keys());
    }

    getDeviceInfo(imei) {
        const socket = this.deviceSockets.get(imei);
        if (!socket) return null;
        return this.socketMetadata.get(socket);
    }
}

module.exports = new DeviceManager();
