const db = require('../db');
const { CONSTANTS } = require('../constants');

class IotCommandDao {
  /**
   * Insert a new IoT Command into tracking logs.
   * @param {Object} data
   * @param {string} data.imei
   * @param {string} data.command
   * @param {Date} data.estimated_timeout_at
   * @param {string} data.booking_log_id
   * @param {string} data.status 
   */
  static async insertCommand({ imei, command, estimated_timeout_at, booking_log_id, status = CONSTANTS.COMMAND_STATUS.PENDING }) {
    return db.query(`
      INSERT INTO tbl_iot_command_logs 
      (imei, command, estimated_timeout_at, booking_log_id, status) 
      VALUES ($1, $2, $3, $4, $5)
    `, [imei, command, estimated_timeout_at, booking_log_id, status]);
  }

  /**
   * Finds the oldest pending command for an IMEI.
   * @returns {Object|null} The row record
   */
  static async findEarliestPendingCommand(imei) {
    const res = await db.query(`
      SELECT * FROM tbl_iot_command_logs 
      WHERE imei = $1 AND status = $2
      ORDER BY created_at ASC LIMIT 1
    `, [imei, CONSTANTS.COMMAND_STATUS.PENDING]);
    return res.rows[0];
  }

  /**
   * Updates an existing command's status.
   */
  static async updateCommandStatus(id, status) {
    return db.query(`
      UPDATE tbl_iot_command_logs 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2
    `, [status, id]);
  }

  /**
   * Checks if a device currently has ANY pending commands.
   * @returns {boolean}
   */
  static async hasPendingCommands(imei) {
    const res = await db.query(
      "SELECT id FROM tbl_iot_command_logs WHERE imei = $1 AND status = $2 LIMIT 1",
      [imei, CONSTANTS.COMMAND_STATUS.PENDING]
    );
    return res.rows.length > 0;
  }

  /**
   * Fetches commands that have timed out and uses SKIP LOCKED mapping.
   * Required to be wrapped in a transaction pool client.
   */
  static async lockTimedOutPendingCommands(client) {
    const res = await client.query(`
      SELECT * 
      FROM tbl_iot_command_logs
      WHERE estimated_timeout_at < NOW() AND status = $1
      FOR UPDATE SKIP LOCKED
    `, [CONSTANTS.COMMAND_STATUS.PENDING]);
    return res.rows;
  }

  /**
   * Increments the retry limit array on target commands.
   * Required to be wrapped in a transaction pool client.
   */
  static async incrementRetriesBulk(client, ids, newTimeoutAt) {
    return client.query(`
      UPDATE tbl_iot_command_logs 
      SET retry = COALESCE(retry, 0) + 1, estimated_timeout_at = $1, updated_at = NOW()
      WHERE id = ANY($2::int[])
    `, [newTimeoutAt, ids]);
  }

  /**
   * Sets multiple IDs to a specific status.
   * Required to be wrapped in a transaction pool client.
   */
  static async updateStatusBulk(client, ids, status) {
    return client.query(`
      UPDATE tbl_iot_command_logs 
      SET status = $1, updated_at = NOW()
      WHERE id = ANY($2::int[])
    `, [status, ids]);
  }
}

module.exports = IotCommandDao;
