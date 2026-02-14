const BaseDecoder = require('../baseDecoder');
const { CONSTANTS } = require('../../constants');


class Tft100Decoder extends BaseDecoder {
    decode(buffer) {
        if (!buffer || buffer.length === 0) {
            return null;
        }

        // Check for Login Packet
        if (buffer.length === 17 && buffer.readUInt16BE(0) === 0x000F) {
            return this.decodeLogin(buffer);
        }

        // Check for Data Packet
        if (buffer.length >= 12 && buffer.readUInt32BE(0) === 0x00000000) {
            return this.decodeData(buffer);
        }

        return null;
    }

    decodeLogin(buffer) {
        const imei = buffer.toString('ascii', 2, 17);
        return {
            type: CONSTANTS.TFT100.PACKET_TYPE.LOGIN,
            imei: imei
        };
    }

    decodeData(buffer) {
        // Skip Preamble (4) and Length (4)
        // Data starts at offset 8
        // Structure: CodecID(1) + Count(1) + Records... + Count(1) + CRC(4)
        
        let offset = 8;
        const codecId = buffer.readUInt8(offset);
        offset++;
        
        const count = buffer.readUInt8(offset);
        offset++;

        if (codecId === CONSTANTS.TFT100.CODECS.CODEC_12) {
            return this.decodeCommandResponse(buffer, offset, count);
        }

        const records = [];
        
        for (let i = 0; i < count; i++) {
            const record = this.decodeAvlData(buffer, offset, codecId);
            if (record) {
                records.push(record.data);
                offset = record.newOffset;
            } else {
                break;
            }
        }

        return {
            type: CONSTANTS.TFT100.PACKET_TYPE.DATA,
            codec: codecId,
            count: count,
            records: records
        };
    }

    decodeAvlData(buffer, offset, codecId) {
        // Timestamp (8 bytes)
        // const timestamp = new Date(Number(buffer.readBigUInt64BE(offset))); // Node 12+
        // Fallback for older node / safe parsing
        const timestampHigh = buffer.readUInt32BE(offset);
        const timestampLow = buffer.readUInt32BE(offset + 4);
        const timestamp = new Date(timestampHigh * 4294967296 + timestampLow);
        offset += 8;

        // Priority (1 byte)
        const priority = buffer.readUInt8(offset);
        offset++;

        // GPS Element
        const longitude = buffer.readInt32BE(offset) / 10000000.0;
        offset += 4;
        const latitude = buffer.readInt32BE(offset) / 10000000.0;
        offset += 4;
        const altitude = buffer.readInt16BE(offset);
        offset += 2;
        const angle = buffer.readUInt16BE(offset);
        offset += 2;
        const satellites = buffer.readUInt8(offset);
        offset++;
        const speed = buffer.readUInt16BE(offset);
        offset += 2;

        // IO Element
        const eventIoId = this.readExtByte(buffer, offset, codecId);
        offset += this.getExtByteSize(codecId);
        
        const totalIoCount = this.readExtByte(buffer, offset, codecId);
        offset += this.getExtByteSize(codecId);

        const ioElements = {};
        
        // 1-byte IO
        const count1Byte = this.readExtByte(buffer, offset, codecId);
        offset += this.getExtByteSize(codecId);
        for (let i = 0; i < count1Byte; i++) {
            if (offset + this.getExtByteSize(codecId) + 1 > buffer.length) break;
            const id = this.readExtByte(buffer, offset, codecId);
            offset += this.getExtByteSize(codecId);
            const value = buffer.readUInt8(offset);
            offset += 1;
            ioElements[id] = value;
        }

        // 2-byte IO
        const count2Byte = this.readExtByte(buffer, offset, codecId);
        offset += this.getExtByteSize(codecId);
        for (let i = 0; i < count2Byte; i++) {
            if (offset + this.getExtByteSize(codecId) + 2 > buffer.length) break;
            const id = this.readExtByte(buffer, offset, codecId);
            offset += this.getExtByteSize(codecId);
            const value = buffer.readUInt16BE(offset);
            offset += 2;
            ioElements[id] = value;
        }

        // 4-byte IO
        const count4Byte = this.readExtByte(buffer, offset, codecId);
        offset += this.getExtByteSize(codecId);
        for (let i = 0; i < count4Byte; i++) {
            if (offset + this.getExtByteSize(codecId) + 4 > buffer.length) break;
            const id = this.readExtByte(buffer, offset, codecId);
            offset += this.getExtByteSize(codecId);
            const value = buffer.readUInt32BE(offset);
            offset += 4;
            ioElements[id] = value;
        }

        // 8-byte IO
        const count8Byte = this.readExtByte(buffer, offset, codecId);
        offset += this.getExtByteSize(codecId);
        for (let i = 0; i < count8Byte; i++) {
            if (offset + this.getExtByteSize(codecId) + 8 > buffer.length) break;
            const id = this.readExtByte(buffer, offset, codecId);
            offset += this.getExtByteSize(codecId);
            // Handling 64-bit integers in JS can be tricky, stick to string or BigInt
            // For simplicity/compatibility, read as hex string or specialized parsing if needed
            // const value = buffer.readBigUInt64BE(offset); 
            // offset += 8;
             const valueHigh = buffer.readUInt32BE(offset);
             const valueLow = buffer.readUInt32BE(offset + 4);
             // Store as BigInt
             const value = (BigInt(valueHigh) << 32n) | BigInt(valueLow);

            offset += 8;
            ioElements[id] = value.toString();
        }

        // X-byte IO (Codec 8 Ext)
        if (codecId === CONSTANTS.TFT100.CODECS.CODEC_8_EXT) {
             const countXByte = buffer.readUInt16BE(offset);
             offset += 2;
             for (let i = 0; i < countXByte; i++) {
                 if (offset + 4 > buffer.length) break; // Basic check
                 const id = buffer.readUInt16BE(offset);
                 offset += 2;
                 const length = buffer.readUInt16BE(offset);
                 offset += 2;
                 if (offset + length > buffer.length) break;
                 const value = buffer.slice(offset, offset + length);
                 offset += length;
                 ioElements[id] = value.toString('hex'); // Or ascii depending on ID
             }
        }
        
        return {
            newOffset: offset,
            data: {
                timestamp,
                priority,
                gps: {
                    latitude,
                    longitude,
                    altitude,
                    angle,
                    satellites,
                    speed
                },
                eventIoId,
                io: ioElements
            }
        };
    }

    decodeCommandResponse(buffer, offset, count) {
        // Codec 12 Format:
        // CodecID(1) + Count1(1) + Type(1) + Size(4) + Data(N) + Count2(1) + CRC(4)
        // We are at Type(1) because CodecID and Count1 were read in decodeData
        
        if (offset + 5 > buffer.length) { // Type(1) + Size(4) check
             console.error('[DECODER] Buffer too short for Codec 12 header');
             return null;
        }

        const type = buffer.readUInt8(offset);
        offset++;
        
        const cmdSize = buffer.readUInt32BE(offset);
        offset += 4;
        
        if (offset + cmdSize > buffer.length) {
            console.error(`[DECODER] Buffer too short for Codec 12 data. Needed: ${offset + cmdSize}, Actual: ${buffer.length}`);
            return null;
        }

        const commandData = buffer.toString('ascii', offset, offset + cmdSize);
        offset += cmdSize;
        
        // Count2 (1 byte) - should match Count1
        offset++; 

        return {
            type: CONSTANTS.TFT100.PACKET_TYPE.RESPONSE,
            codec: CONSTANTS.TFT100.CODECS.CODEC_12,
            respType: type, // 5=Command, 6=Response
            data: commandData
        };
    }

    readExtByte(buffer, offset, codecId) {
        if (offset >= buffer.length) {
            throw new Error(`Buffer overflow: offset ${offset} >= ${buffer.length}`);
        }
        if (codecId === CONSTANTS.TFT100.CODECS.CODEC_8_EXT) {
            return buffer.readUInt16BE(offset);
        } else {
            return buffer.readUInt8(offset);
        }
    }
    
    getExtByteSize(codecId) {
        return codecId === CONSTANTS.TFT100.CODECS.CODEC_8_EXT ? 2 : 1;
    }
}

module.exports = Tft100Decoder;
