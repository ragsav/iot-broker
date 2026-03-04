const axios = require('axios');
const { CONSTANTS } = require('../constants');

class NotificationService {

    /**
       * Notification: command response received and matched to a log entry.
       * data.identified = true when log entry was found, false for unidentified responses.
       * data.metadata contains the round-tripped metadata from the original sendCommand call.
       */
    static notifyCommandSuccess = async (data) => {
        try {
            console.log('NOTIFY:CommandSuccess', data);
            const backendUrl = CONSTANTS.NOTIFICATION_URL;
            if (backendUrl) {
                await axios.post(`${backendUrl}/webhooks/iot/v1/command/confirm`, data);
            }
        } catch (error) {
            console.error('NotificationService:notifyCommandSuccess:error', error.message);
        }
    }

    /**
     * Notification: commands exhausted retries and were removed (bulk).
     * Receives array of failed command entries with metadata.
     */
    static notifyBulkCommandFailure = async (entries) => {
        try {
            console.log('NOTIFY:BulkCommandFailure', { count: entries.length, entries });
            const backendUrl = CONSTANTS.NOTIFICATION_URL;
            if (backendUrl) {
                await axios.post(`${backendUrl}/webhooks/iot/v1/command/bulk_failure`, { entries });
            }
        } catch (error) {
            console.error('NotificationService:notifyBulkCommandFailure:error', error.message);
        }
    }

    /**
     * Notification: single command failure (explicit NACK or other error).
     */
    static notifyCommandFailure = async (data) => {
        try {
            console.log('NOTIFY:CommandFailure', data);
            const backendUrl = CONSTANTS.NOTIFICATION_URL;
            if (backendUrl) {
                await axios.post(`${backendUrl}/webhooks/iot/v1/command/failure`, data);
            }
        } catch (error) {
            console.error('NotificationService:notifyCommandFailure:error', error.message);
        }
    }

    /**
     * Notification: commands were retried (bulk).
     * Receives array of retried command entries.
     */
    static notifyBulkCommandRetry = async (entries) => {
        console.log('NOTIFY:BulkCommandRetry', { count: entries.length, entries });
    }

    /**
     * Notification: new telemetry data received from a device.
     * Only called when TELEMETRY_WEBHOOK_ENABLED is true.
     */
    static notifyTelemetryData = async (data) => {
        try {
            console.log('NOTIFY:TelemetryData', { imei: data.imei, recordCount: data.recordCount });
            const backendUrl = CONSTANTS.NOTIFICATION_URL;
            if (backendUrl) {
                await axios.post(`${backendUrl}/webhooks/iot/v1/telemetry`, data);
            }
        } catch (error) {
            console.error('NotificationService:notifyTelemetryData:error', error.message);
        }
    }

}

module.exports = NotificationService;
