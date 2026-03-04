
// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================
const CONSTANTS = {

    BROKER_PORT: parseInt(process.env.BROKER_PORT) || 9000,
    MAX_DEVICE_CONNECTIONS: 10000,
    SOCKET_KEEPALIVE: 600000, // 10 minutes in ms
    SOCKET_TIMEOUT: 600000, // 10 minutes in ms
    API_PORT: parseInt(process.env.API_PORT) || 8091,
    API_KEY: process.env.IOT_API_KEY,
    NOTIFICATION_URL: process.env.NOTIFICATION_URL,
    TELEMETRY_WEBHOOK_ENABLED: process.env.TELEMETRY_WEBHOOK_ENABLED === 'true',
    TFT100: {
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
        },
    },
    IOT_COMMAND_TIMEOUT: 60, // seconds
    DEFAULT_MAX_IOT_COMMAND_RETRY: 3,
    ERROR_CODES: {
        SERVER_ERROR: 'SERVER_ERROR'
    },
    IOT_COMMANDS: {
        VEHICLE_START: {
            command: "setdigout 1?",
            response: ['DOUT1:1', 'DOUT1:Already set to 1']
        },
        VEHICLE_STOP: {
            command: "setdigout 0?",
            response: ['DOUT1:0', 'DOUT1:Already set to 0']
        }
    },
    COMMAND_STATUS: {
        PENDING: 'PENDING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
    },
    VALIDATE_COMMAND_RESPONSE: process.env.VALIDATE_COMMAND_RESPONSE !== 'false'
}

module.exports = {
    CONSTANTS
};
