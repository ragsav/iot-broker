const db = require('../db');
const IotCommandDao = require('../dao/iotCommand.dao');
const moment = require('moment');
const { CONSTANTS } = require('../constants');
const deviceManager = require('./deviceManagement.service');
const NotificationService = require('./notification.service');

class IOTService {
  /**
   *
   * @param {object} param0
   * @param {String} param0.imei
   * @param {String} param0.command
   */
  static async sendCommand({ imei, command, booking_log_id, force = false }) {
    try {
      console.log("info", {
        message: "IOTService:sendCommand:params",
        params: {
          imei,
          command,
          booking_log_id,
          force
        },
      });

      const socket = deviceManager.getSocket(imei);

      if (!force) {
        // Check if there are any pending commands
        const hasPending = await IotCommandDao.hasPendingCommands(imei);

        if (hasPending) {
          console.log("warn", {
            message: "IOTService:sendCommand:pending-exists",
            params: { imei },
          });
          throw new Error("A command is already pending for this device. Use force=true to override.");
        }
      }

      try {
        await IotCommandDao.insertCommand({
          imei,
          command,
          estimated_timeout_at: moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds").toDate(),
          booking_log_id,
          status: CONSTANTS.COMMAND_STATUS.PENDING
        });
      } catch (error) {
        console.error("error", {
          message: "IOTService:sendCommand:db-insert-error",
          params: { error },
        });
      }

      if (socket) {
        // We need to encode the command. 
        // The original snippet used: socket?.write(Buffer.from(generateCodec12(command), "hex"));
        // I will use the encoder from protocols which I will verify.
        // For now, assuming standard Codec12 string command.
        // If generateCodec12 is not available, we construct it.
        // Codec12: 0x00000000 (preamble) + Data Size + CodecID(0x0C) + Command Count(1) + Type(5) + CmdSize + Command + Count(1) + CRC
        // Actually, the snippet said `Buffer.from(generateCodec12(command), "hex")` implies generateCodec12 returns a hex string.
        
        // Let's perform the write using the encoder we have or will update.
        // deviceManager.sendCommand already handles encoding! 
        // But the snippet does it manually.
        // deviceManager.sendCommand(imei, command) uses Tft100Encoder.
        // So I can just call deviceManager.sendCommand? 
        // BUT, the snippet wants to LOG first, then delete logs, then CREATE log, THEN send.
        // deviceManager.sendCommand does not do DB logs.
        // So I will use deviceManager.sendCommand BUT I need to ensure it doesn't double send or I replicate its logic.
        // deviceManager.sendCommand sends the packet.
        
        const sent = deviceManager.sendCommand(imei, command);
        
        if (sent) {
            console.log("success", {
            message: "IOTService:sendCommand:command sent",
            params: {
                imei,
                command,
              booking_log_id,
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
   *
   * @param {object} param0
   * @param {String} param0.imei
   * @param {String} param0.command // Response string
   */
  static async confirmCommandExecution({ imei, command }) {
    try {
        const responseStr = command; // usage in snippet
      console.log("info", {
        message: "IOTService:confirmCommandExecution:params",
        params: { imei, content: responseStr },
      });

      // We find the EARLIEST PENDING command for this IMEI
      const logEntry = await IotCommandDao.findEarliestPendingCommand(imei);

      if (!logEntry) return;

      // Update to COMPLETED instead of deleting
      await IotCommandDao.updateCommandStatus(logEntry.id, CONSTANTS.COMMAND_STATUS.COMPLETED);

      console.log("info", {
        message: "IOTService:confirmCommandExecution:iotCommandLogEntry",
        params: {
          imei,
          responseStr: responseStr,
          iotCommandLogEntryTime: logEntry?.created_at,
        },
      });

      // Notify command success
      await NotificationService.notifyCommandSuccess({
        identified: true,
        imei: logEntry.imei,
        command: logEntry.command,
        response: responseStr,
        booking_log_id: logEntry.booking_log_id || null,
      });

      console.log("success", {
        message: "IOTService:confirmCommandExecution:success",
        params: {
          imei: logEntry.imei,
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
    let client;
    try {
      console.log("info", {
        message: "IOTService:revertTimeoutCommands:init",
      });

      client = await db.pool.connect();
      await client.query('BEGIN');

      // Find commands that have timed out and lock them to avoid race conditions across instances
      const iotCommandLogEntries = await IotCommandDao.lockTimedOutPendingCommands(client);

      if (iotCommandLogEntries.length === 0) {
        await client.query('COMMIT');
        client.release();
        return;
      }

      const toRetry = [];
      const toFail = [];

      for (const entry of iotCommandLogEntries) {
        if ((entry.retry || 0) >= CONSTANTS.DEFAULT_MAX_IOT_COMMAND_RETRY) {
          toFail.push(entry);
        } else {
          toRetry.push(entry);
        }
      }

      // Handle Retries
      if (toRetry.length > 0) {
        const ids = toRetry.map(e => e.id);
        const newTimeout = moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds").toDate();

        // Bulk Update
        await IotCommandDao.incrementRetriesBulk(client, ids, newTimeout);

        // Sequential device send
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

        // Bulk retry notification
        await NotificationService.notifyBulkCommandRetry(toRetry);
      }

      // Handle Failures
      if (toFail.length > 0) {
        const ids = toFail.map(e => e.id);

        // Bulk Update to FAILED
        await IotCommandDao.updateStatusBulk(client, ids, CONSTANTS.COMMAND_STATUS.FAILED);

        // Bulk Log
        console.log("warn", {
          message: "IOTService:revertTimeoutCommands:failed_bulk",
          params: {
            total: toFail.length,
            imeis: imeis
          },
        });

        // Bulk failure notification
        await NotificationService.notifyBulkCommandFailure(toFail);
      }

      await client.query('COMMIT');

      console.log("success", {
        message: "IOTService:revertTimeoutCommands:success",
        params: {
          failed_count: toFail.length,
          retried_count: toRetry.length,
        },
      });

    } catch (error) {
      if (client) await client.query('ROLLBACK');
      console.log("error", {
        message: "IOTService:revertTimeoutCommands:catch-1",
        params: { error: error.message },
      });
    } finally {
      if (client) client.release();
    }
  }
}

module.exports = IOTService;
