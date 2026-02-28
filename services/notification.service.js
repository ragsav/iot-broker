const axios = require('axios');
const { CONSTANTS } = require('../constants');

class NotificationService {
  /**
   * Notification: command response received and matched to a log entry.
   * data.identified = true when log entry was found, false for unidentified responses.
   */
  static async notifyCommandSuccess(data) {
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
   * Notification: single command failure (explicit NACK or other error).
   */
  static async notifyCommandFailure(data) {
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
   * Notification: commands exhausted retries and were removed (bulk).
   * Receives array of failed command entries.
   */
  static async notifyBulkCommandFailure(entries) {
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
   * Notification: commands were retried (bulk).
   * Receives array of retried command entries.
   */
  static async notifyBulkCommandRetry(entries) {
    console.log('NOTIFY:BulkCommandRetry', { count: entries.length, entries });
    // If webhook is needed in the future, add axios.post here
  }
}

module.exports = NotificationService;
