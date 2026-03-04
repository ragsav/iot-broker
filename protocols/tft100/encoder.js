const BaseEncoder = require('../baseEncoder');
const { CONSTANTS } = require('../../constants');

class Tft100Encoder extends BaseEncoder {
    encode(data) {
        // Generic encode method - could be used to route to specific encoders
        return Buffer.alloc(0);
    }
    
    encodeLoginResponse(accepted) {
        return Buffer.from([accepted ? 0x01 : 0x00]);
    }
    
    encodeDataResponse(count) {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(count);
        return buffer;
    }

    encodeCommand(command) {
        // Codec 12 Command Encoding
        // Structure: 0x00000000 (Preamble) + Length + Codec12 + Count1 + Type + CmdSize + Cmd + Count1 + CRC
        
        const cmdBuffer = Buffer.from(command, 'ascii');
        const cmdSize = cmdBuffer.length;
        
        // Data part (between Length and CRC)
        // CodecID(1) + Count(1) + Type(1) + CmdSize(4) + Cmd(N) + Count(1)
        const dataLength = 1 + 1 + 1 + 4 + cmdSize + 1;
        const dataBuffer = Buffer.alloc(dataLength);
        
        let offset = 0;
        dataBuffer.writeUInt8(CONSTANTS.TFT100.CODECS.CODEC_12, offset++); // Codec ID
        dataBuffer.writeUInt8(1, offset++); // Command Quantity 1
        dataBuffer.writeUInt8(5, offset++); // Type (5 = Command, 6 = Response)
        dataBuffer.writeUInt32BE(cmdSize, offset); offset += 4; // Command Size
        cmdBuffer.copy(dataBuffer, offset); offset += cmdSize; // Command
        dataBuffer.writeUInt8(1, offset++); // Command Quantity 2
        
        // Calculate CRC
        const crc = this.calculateCrc16(dataBuffer);
        
        // Construct final packet
        // Preamble(4) + Length(4) + Data + CRC(4)
        const finalBuffer = Buffer.alloc(8 + dataLength + 4);
        finalBuffer.writeUInt32BE(0, 0); // Preamble
        finalBuffer.writeUInt32BE(dataLength, 4); // Length
        dataBuffer.copy(finalBuffer, 8);
        finalBuffer.writeUInt32BE(crc, 8 + dataLength);
        
        return finalBuffer;
    }

    calculateCrc16(buffer) {
        let crc = 0;
        for (let i = 0; i < buffer.length; i++) {
            crc ^= buffer[i];
            for (let j = 0; j < 8; j++) {
                if ((crc & 1) > 0) {
                    crc = (crc >> 1) ^ 0xA001;
                } else {
                    crc = crc >> 1;
                }
            }
        }
        return crc;
    }
}

module.exports = Tft100Encoder;
