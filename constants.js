
// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================
const CONSTANTS = {
    SERVER_PORT:1111,
    MAX_DEVICE_CONNECTIONS:10000,
    SOCKET_KEEPALIVE: 60000, // 60 seconds
    SOCKET_TIMEOUT: 30000, // 30 seconds
    API_PORT: 8090,
    TFT100:{
        CODECS: {
            GH3000: 0x07,
            CODEC_8: 0x08,
            CODEC_8_EXT: 0x8E,
            CODEC_12: 0x0C,
            CODEC_13: 0x0D,
            CODEC_16: 0x10,
        },
        IO_IDS: {
            IGNITION: 239,
            MOVEMENT: 240,
            GSM_SIGNAL: 21,
            SLEEP_MODE: 200,
            GNSS_STATUS: 69,
            BATTERY_VOLTAGE: 67,
            BATTERY_CURRENT: 68,
            BATTERY_LEVEL: 113,
            EXTERNAL_VOLTAGE: 66,
            SPEED: 24,
            ODOMETER: 16,
            ODOMETER_TRIP: 199,
            FUEL_USED_GPS: 12,
            FUEL_LEVEL: 89,
        },
        PACKET_TYPE: {
            LOGIN: 0x01,
            DATA: 0x02,
            RESPONSE: 0x03,
        }
    }
}

module.exports = {
    CONSTANTS
};
