const BaseFramer = require('../baseFramer');

class Tft100Framer extends BaseFramer {
    constructor(options) {
        super(options);
    }

    processBuffer() {
        while (this.buffer.length > 0) {
            // We need at least 2 bytes to determine packet type
            if (this.buffer.length < 2) {
                break;
            }

            // Check for Login Packet (starts with 0x000F)
            const firstTwoBytes = this.buffer.readUInt16BE(0);
            
            if (firstTwoBytes === 0x000F) {
                // Login packet is fixed 17 bytes: 2 bytes header + 15 bytes IMEI
                const LOGIN_PACKET_SIZE = 17;
                
                if (this.buffer.length >= LOGIN_PACKET_SIZE) {
                    const packet = this.buffer.slice(0, LOGIN_PACKET_SIZE);
                    this.push(packet);
                    this.buffer = this.buffer.slice(LOGIN_PACKET_SIZE);
                    continue;
                } else {
                    // Wait for more data
                    break;
                }
            }
            
            // Check for Data Packet (starts with 0x0000)
            else if (this.buffer.readUInt32BE(0) === 0x00000000) {
                // We need at least 8 bytes (Preamble + Length) to know full size
                if (this.buffer.length < 8) {
                    break;
                }

                const dataLength = this.buffer.readUInt32BE(4);
                // Total length: 4 bytes Preamble + 4 bytes Length + N bytes Data + 4 bytes CRC
                const totalLen = 8 + dataLength + 4;

                // Validate packet length is reasonable (64KB max usually)
                if (dataLength > 65536) {
                    console.error('[FRAMER] Invalid data length, flushing buffer');
                    this.buffer = Buffer.alloc(0);
                    break;
                }

                // Check if we have the complete packet
                if (this.buffer.length >= totalLen) {
                    const packet = this.buffer.slice(0, totalLen);
                    this.push(packet);
                    this.buffer = this.buffer.slice(totalLen);
                    continue;
                } else {
                    // Wait for more data
                    break;
                }
            } else {
                // Unrecognized packet start - flush buffer to avoid getting stuck
                console.warn(`[FRAMER] Unknown packet header: 0x${firstTwoBytes.toString(16)}, flushing buffer`);
                this.buffer = Buffer.alloc(0);
                break;
            }
        }
    }
}

module.exports = Tft100Framer;
