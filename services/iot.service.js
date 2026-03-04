const db = require('../db');
const moment = require('moment');
const { CONSTANTS } = require('../constants');
const deviceManager = require('./deviceManagement.service');
const NotificationService = require('./notification.service');

const { COMMAND_STATUS } = CONSTANTS;

/**
 * Validates whether a received response matches what's expected for a given command.
 * Configurable via VALIDATE_COMMAND_RESPONSE env flag.
 * @param {string} sentCommand - The command that was sent (e.g. "setdigout 1?")
 * @param {string} responseStr - The response received from the device
 * @returns {{ valid: boolean, expected: string[]|null }} 
 */
function isValidCommandResponse(sentCommand, responseStr) {
  console.log("info", {
    message: "IOTService:isValidCommandResponse:params",
    params: {
      sentCommand,
      responseStr,
    },
  });
  if (!CONSTANTS.VALIDATE_COMMAND_RESPONSE) {
    return { valid: true, expected: null };
  }

  const expectedCmd = Object.values(CONSTANTS.IOT_COMMANDS)
    .find(c => c.command == sentCommand);

  // If command isn't in IOT_COMMANDS (e.g. custom/raw command), skip validation
  if (!expectedCmd) {
    return { valid: true, expected: null };
  }

  let v = false;
  expectedCmd.response.forEach(r => {
    if (responseStr.includes(r)) {
      v = true;
    }
  });

  return {
    valid: v,
    expected: expectedCmd.response,
  };
}

class IOTService {
  /**
   * Send a command to a device.
   * @param {object} param0
   * @param {String} param0.imei - Device IMEI
   * @param {String} param0.command - Command string to send
   * @param {Object} [param0.metadata] - Optional metadata (JSON) to round-trip through webhooks
   */
  static async sendCommand({ imei, command, metadata }) {
    try {
      console.log("info", {
        message: "IOTService:sendCommand:params",
        params: {
          imei,
          command,
          metadata,
        },
      });

      const socket = deviceManager.getSocket(imei);

      // Mark any existing PENDING commands for this IMEI as FAILED (superseded)
      try {
        await db.query(
          `UPDATE tbl_iot_command_logs 
           SET status = $1, updated_at = NOW(), completed_at = NOW() 
           WHERE imei = $2 AND status = $3`,
          [COMMAND_STATUS.FAILED, imei, COMMAND_STATUS.PENDING]
        );
      } catch (error) { }

      await db.query(
        `INSERT INTO tbl_iot_command_logs (imei, command, estimated_timeout_at, metadata, status) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          imei,
          command, 
          moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds").toDate(),
          metadata ? JSON.stringify(metadata) : null,
          COMMAND_STATUS.PENDING
        ]
      );

      if (socket) {
        const sent = deviceManager.sendCommand(imei, command);
        
        if (sent) {
          console.log("success", {
            message: "IOTService:sendCommand:command sent",
            params: {
              imei,
              command,
              metadata,
            },
          });
          return true;
        } else {
          throw CONSTANTS.ERROR_CODES.SERVER_ERROR;
        }
      } else {
        console.log("error", {
          message: "IOTService:sendCommand:catch-2",
          params: { error: CONSTANTS.ERROR_CODES.SERVER_ERROR },
        });

        throw CONSTANTS.ERROR_CODES.SERVER_ERROR;
      }
    } catch (error) {
      console.log("error", {
        message: "IOTService:sendCommand:catch-1",
        params: { error },
      });
      return false;
    }
  }

  /**
   * Confirm that a command response was received from a device.
   * @param {object} param0
   * @param {String} param0.imei - Device IMEI
   * @param {String} param0.command - Response string from the device
   */
  static async confirmCommandExecution({ imei, command }) {
    try {
      const responseStr = command;
      console.log("info", {
        message: "IOTService:confirmCommandExecution:params",
        params: { imei, content: responseStr },
      });

      const res = await db.query(
        'SELECT * FROM tbl_iot_command_logs WHERE imei = $1 AND status = $2',
        [imei, COMMAND_STATUS.PENDING]
      );
      const iotCommandLogEntry = res.rows[0];

      if (!iotCommandLogEntry) return;

      // Validate response matches the pending command (catches stale responses)
      const validation = isValidCommandResponse(iotCommandLogEntry.command, responseStr);
      if (!validation.valid) {
        console.warn("IOTService:confirmCommandExecution:response_mismatch", {
          imei,
          expected: validation.expected,
          received: responseStr,
          pendingCommand: iotCommandLogEntry.command,
        });
        return; // Don't mark complete — stale response from previous command
      }

      // Mark as COMPLETED with response
      await db.query(
        `UPDATE tbl_iot_command_logs 
         SET status = $1, response = $2, updated_at = NOW(), completed_at = NOW() 
         WHERE command_log_id = $3`,
        [COMMAND_STATUS.COMPLETED, responseStr, iotCommandLogEntry.command_log_id]
      );

      console.log("info", {
        message: "IOTService:confirmCommandExecution:iotCommandLogEntry",
        params: {
          imei,
          responseStr: responseStr,
          iotCommandLogEntryTime: iotCommandLogEntry.created_at,
        },
      });

      await NotificationService.notifyCommandSuccess({
        identified: true,
        imei: iotCommandLogEntry.imei,
        command: iotCommandLogEntry.command,
        response: responseStr,
        metadata: iotCommandLogEntry.metadata || null,
      });

      console.log("success", {
        message: "IOTService:confirmCommandExecution:success",
        params: {
          imei: iotCommandLogEntry.imei,
          metadata: iotCommandLogEntry.metadata,
        },
      });
    } catch (error) {
      console.log("error", {
        message: "IOTService:confirmCommandExecution:catch-1",
        params: { error },
      });
    }
  }

  static async revertTimeoutCommands() {
    try {
      console.log("info", {
        message: "IOTService:revertTimeoutCommands:init",
      });

      const res = await db.query(`
        SELECT * FROM tbl_iot_command_logs
        WHERE estimated_timeout_at < NOW() AND status = $1
      `, [COMMAND_STATUS.PENDING]);

      const iotCommandLogEntries = res.rows;

      const toRetry = [];
      const toFail = [];

      for (const entry of iotCommandLogEntries) {
        if (entry.retry >= CONSTANTS.DEFAULT_MAX_IOT_COMMAND_RETRY) {
          toFail.push(entry);
        } else {
          toRetry.push(entry);
        }
      }

      // Handle Retries
      if (toRetry.length > 0) {
        const commandLogIds = toRetry.map(e => e.command_log_id);
        const newTimeout = moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds").toDate();

        await db.query(`
          UPDATE tbl_iot_command_logs 
          SET retry = retry + 1, estimated_timeout_at = $1, updated_at = NOW()
          WHERE command_log_id = ANY($2::bigint[])
        `, [newTimeout, commandLogIds]);

        const sentImeis = [];
        const failedImeis = [];

        for (const entry of toRetry) {
          const sent = deviceManager.sendCommand(entry.imei, entry.command);
          if (sent) sentImeis.push(entry.imei);
          else failedImeis.push(entry.imei);
        }

        console.log("info", {
          message: "IOTService:revertTimeoutCommands:retried_bulk",
          params: {
            total: toRetry.length,
            sent: sentImeis,
            failed_to_send: failedImeis
          },
        });

        await NotificationService.notifyBulkCommandRetry(toRetry);
      }

      // Handle Failures — mark as FAILED instead of deleting
      if (toFail.length > 0) {
        const commandLogIds = toFail.map(e => e.command_log_id);

        await db.query(`
          UPDATE tbl_iot_command_logs
          SET status = $1, updated_at = NOW(), completed_at = NOW()
          WHERE command_log_id = ANY($2::bigint[])
        `, [COMMAND_STATUS.FAILED, commandLogIds]);

        console.log("warn", {
          message: "IOTService:revertTimeoutCommands:failed_bulk",
          params: {
            total: toFail.length,
            imeis: toFail.map(e => e.imei)
          },
        });

        await NotificationService.notifyBulkCommandFailure(toFail);
      }

      console.log("success", {
        message: "IOTService:revertTimeoutCommands:success",
        params: {
          failed_count: toFail.length,
          retried_count: toRetry.length,
        },
      });

    } catch (error) {
      console.log("error", {
        message: "IOTService:revertTimeoutCommands:catch-1",
        params: { error: error.message },
      });
    }
  }
}

module.exports = IOTService;
