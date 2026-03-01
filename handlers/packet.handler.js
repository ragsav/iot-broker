
const Tft100Decoder = require('../protocols/tft100/decoder');
const Tft100Encoder = require('../protocols/tft100/encoder');
const deviceManager = require('../services/deviceManagement.service');
const IOTService = require('../services/iot.service');
const TelemetryService = require('../services/telemetry.service');
const { PROTOCOL_CONSTANTS } = require('../protocols/protocol.constants');
const deviceCache = require('../services/deviceCache.service');

class PacketHandler {
    constructor() {
        this.decoder = new Tft100Decoder();
        this.encoder = new Tft100Encoder();
    }

    handlePacket(socket, packet) {
        try {
            const decoded = this.decoder.decode(packet);

            if (!decoded) {
                console.warn('[PACKET] Failed to decode packet');
                return;
            }

            switch (decoded.type) {
                case PROTOCOL_CONSTANTS.TFT100.PACKET_TYPE.LOGIN:
                    this.handleLogin(socket, decoded);
                    break;
                case PROTOCOL_CONSTANTS.TFT100.PACKET_TYPE.DATA:
                    this.handleData(socket, decoded);
                    break;
                case PROTOCOL_CONSTANTS.TFT100.PACKET_TYPE.RESPONSE:
                    this.handleResponse(socket, decoded);
                    break;
                default:
                    console.warn('[PACKET] Unknown packet type:', decoded.type);
            }
        } catch (err) {
            console.error('[PACKET] Error handling packet:', err);
        }
    }

    handleLogin(socket, decoded) {
        const imei = decoded.imei;

        console.log('[LOGIN] Device attempting login:', {
            imei,
            remoteAddress: socket.remoteAddress,
            remotePort: socket.remotePort
        });

        // Validate IMEI (Basic check)
        if (!imei || !/^\d{15}$/.test(imei)) {
            console.error('[LOGIN] Invalid IMEI format:', imei);
            socket.destroy();
            return;
        }

        // Validate IMEI against cache
        if (!deviceCache.isDeviceAuthorized(imei)) {
            console.error('[LOGIN] Unauthorized device attempted connection:', imei);
            socket.destroy();
            return;
        }

        // Check if device is banned
        if (deviceManager.isBanned(imei)) {
            console.warn('[LOGIN] Banned device attempted connection:', imei);
            socket.destroy();
            return;
        }

        // Add connection to manager (handles old connection cleanup)
        deviceManager.addConnection(socket, imei);

        // Send ACK (0x01)
        socket.write(Buffer.from([0x01]));

        console.log('[LOGIN] ✓ Device authenticated successfully:', {
            imei,
            totalDevices: deviceManager.getStats().authenticatedDevices
        });
    }

    handleData(socket, decoded) {
        if (!socket.authenticated || !socket.imei) {
            console.error('[DATA] Unauthenticated data packet, dropping connection');
            socket.destroy();
            return;
        }

        // Log the data packet details
        console.log('[DATA] Received data packet:', {
            imei: socket.imei,
            codecType: decoded.codec,
            recordCount: decoded.count,
            timestamp: new Date().toISOString()
        });

        // Here you would normally send to queue
        const payload = {
            imei: socket.imei,
            ...decoded,
            timestamp: Date.now(),
            sourceIP: socket.remoteAddress
        };

        console.log('[QUEUE] Message ready to be sent to queue:', JSON.stringify(payload).substring(0, 50));

        // Save telemetry to DB and update vehicle status via TelemetryService
        if (decoded.records && decoded.records.length > 0) {
            TelemetryService.handleTelemetry(socket.imei, decoded.records);
        }

        // Send ACK (4-byte record count in big-endian)
        const ack = this.encoder.encodeDataResponse(decoded.count);
        socket.write(ack);

        console.log('[DATA] ✓ ACK sent:', {
            imei: socket.imei,
            recordCount: decoded.count
        });
    }

    handleResponse(socket, decoded) {
        if (!socket.authenticated || !socket.imei) {
             console.error('[RESPONSE] Unauthenticated response packet, dropping connection');
             socket.destroy();
             return;
        }

        console.log('[RESPONSE] Received command response:', {
            imei: socket.imei,
            responseType: decoded.respType, // 5=Command, 6=Response
            data: decoded.data
        });

        if (decoded.respType === 5 || decoded.respType === 6) { // Command or Response
            IOTService.confirmCommandExecution({
                imei: socket.imei,
                command: decoded.data
            });
        }
    }
}

module.exports = new PacketHandler();
