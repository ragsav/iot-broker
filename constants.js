
// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================
const CONSTANTS = {

    BROKER_PORT: 9000,
    MAX_DEVICE_CONNECTIONS:10000,
    SOCKET_KEEPALIVE: 600000, // 10 minutes in ms
    SOCKET_TIMEOUT: 600000, // 30 seconds in ms
    API_PORT: 8091,
    API_KEY: process.env.API_KEY,
    NOTIFICATION_URL: `http://localhost:8090`,
    IOT_COMMAND_TIMEOUT: 60, // seconds
    DEFAULT_MAX_IOT_COMMAND_RETRY: 3,
    ERROR_CODES: {
        SERVER_ERROR: 'SERVER_ERROR',
        DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
        DEVICE_NOT_CONNECTED: 'DEVICE_NOT_CONNECTED',
        COMMAND_FAILED: 'COMMAND_FAILED',
        COMMAND_TIMED_OUT: 'COMMAND_TIMED_OUT',
        UNAUTHORIZED: 'UNAUTHORIZED',
        NOT_FOUND: 'NOT_FOUND',
        BAD_REQUEST: 'BAD_REQUEST',
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
    BOOKING_ACTIONS: {
        INITIATE_START: 'INITIATE_START',
        INITIATE_PAUSE: 'INITIATE_PAUSE',
        INITIATE_RESUME: 'INITIATE_RESUME',
    },
    COMMAND_STATUS: {
        PENDING: 'PENDING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED'
    }
}

module.exports = {
    CONSTANTS
};
