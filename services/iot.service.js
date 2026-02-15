const db = require('../db');
const moment = require('moment');
const { CONSTANTS } = require('../constants');
const deviceManager = require('./deviceManagement.service');
const axios = require('axios');

const IOTService = {
  /**
   *
   * @param {object} param0
   * @param {String} param0.imei
   * @param {String} param0.command
   */
  sendCommand: async ({ imei, command, booking_log_id }) => {
    try {
      console.log("info", {
        message: "IOTService:sendCommand:params",
        params: {
          imei,
          command,
          booking_log_id,
          // imei_to_socket: Object.keys(global.imei_to_socket), // global.imei_to_socket not defined in this context, accessing deviceManager
        },
      });

      
      const socket = deviceManager.getSocket(imei);

      try {
        await db.query('DELETE FROM tbl_iot_command_logs WHERE imei = $1', [imei]);
      } catch (error) {}

      await db.query(
        'INSERT INTO tbl_iot_command_logs (imei, command, estimated_timeout_at, booking_log_id) VALUES ($1, $2, $3, $4)',
        [
          imei, 
          command, 
          moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds").toDate(), 
          booking_log_id
        ]
      );

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
  },

  /**
   *
   * @param {object} param0
   * @param {String} param0.imei
   * @param {String} param0.command // Response string
   */
  confirmCommandExecution: async ({ imei, command }) => {
    try {
        const responseStr = command; // usage in snippet
      console.log("info", {
        message: "IOTService:confirmCommandExecution:params",
        params: { imei, content: responseStr },
      });

      const res = await db.query('SELECT * FROM tbl_iot_command_logs WHERE imei = $1', [imei]);
      const iotCommandLogEntry = res.rows[0];

      if (!iotCommandLogEntry) return;

      // Ensure tbl_booking_logs relation if needed. 
      // The snippet assumes iotCommandLogEntry has tbl_booking_logs.
      // We might need a JOIN if we need booking action.
      // "include: { tbl_booking_logs: true }" in Prisma.
      // SQL: SELECT * FROM tbl_iot_command_logs t1 LEFT JOIN tbl_booking_logs t2 ON t1.booking_log_id = t2.booking_log_id WHERE t1.imei = ...
      
      const resWithJoin = await db.query(`
        SELECT t1.*, t2.booking_action, t2.booking_id 
        FROM tbl_iot_command_logs t1 
        LEFT JOIN tbl_booking_logs t2 ON t1.booking_log_id = t2.booking_log_id 
        WHERE t1.imei = $1
      `, [imei]);
      
      const logEntry = resWithJoin.rows[0];

      await db.query('DELETE FROM tbl_iot_command_logs WHERE imei = $1', [imei]);

      console.log("info", {
        message: "IOTService:confirmCommandExecution:iotCommandLogEntry",
        params: {
          imei,
          responseStr: responseStr,
          iotCommandLogEntryTime: logEntry?.created_at,
        },
      });

      // Notify command success — identified command (log entry found)
      await IOTService.notifyCommandSuccess({
        identified: true,
        imei: logEntry.imei,
        command: logEntry.command,
        response: responseStr,
        booking_action: logEntry.booking_action || null,
        booking_log_id: logEntry.booking_log_id || null,
        booking_id: logEntry.booking_id || null,
      });

      console.log("success", {
        message: "IOTService:confirmCommandExecution:success",
        params: {
          imei: logEntry.imei,
          booking_action: logEntry.booking_action,
        },
      });
    } catch (error) {
      console.log("error", {
        message: "IOTService:confirmCommandExecution:catch-1",
        params: { error },
      });
    }
  },

  /**
   * Notification: command response received and matched to a log entry.
   * data.identified = true when log entry was found, false for unidentified responses.
   */
  notifyCommandSuccess: async (data) => {
    try {
      console.log('NOTIFY:CommandSuccess', data);
      const backendUrl = CONSTANTS.NOTIFICATION_URL;
      if (backendUrl) {
        await axios.post(`${backendUrl}/webhooks/iot/v1/command/confirm`, data);
      }
    } catch (error) {
      console.error('IOTService:notifyCommandSuccess:error', error.message);
    }
  },

  /**
   * Notification: commands exhausted retries and were removed (bulk).
   * Receives array of failed command entries with booking_action.
   */
  notifyBulkCommandFailure: async (entries) => {
    try {
      console.log('NOTIFY:BulkCommandFailure', { count: entries.length, entries });
      const backendUrl = CONSTANTS.NOTIFICATION_URL;
      if (backendUrl) {
        await axios.post(`${backendUrl}/webhooks/iot/v1/command/bulk_failure`, { entries });
      }
    } catch (error) {
      console.error('IOTService:notifyBulkCommandFailure:error', error.message);
    }
  },

  /**
   * Notification: single command failure (explicit NACK or other error).
   */
  notifyCommandFailure: async (data) => {
    try {
      console.log('NOTIFY:CommandFailure', data);
      const backendUrl = CONSTANTS.NOTIFICATION_URL;
      if (backendUrl) {
        await axios.post(`${backendUrl}/webhooks/iot/v1/command/failure`, data);
      }
    } catch (error) {
      console.error('IOTService:notifyCommandFailure:error', error.message);
    }
  },

  /**
   * Notification: commands were retried (bulk).
   * Receives array of retried command entries.
   */
  notifyBulkCommandRetry: async (entries) => {
    console.log('NOTIFY:BulkCommandRetry', { count: entries.length, entries });
  },

  handleTelemetry: async (imei, records) => {
      if (!records || records.length === 0) return;
      
      const query = `
        INSERT INTO tbl_iot_telemetry_data (
            iot_imei, iot_timestamp, timestamp, latitude, longitude, speed,
            internal_battery_voltage, internal_battery_current, internal_battery_percent,
            external_voltage, external_extended_voltage, analog_input_1, analog_input_2,
            trip_odometer, total_odometer, x_axis, y_axis, z_axis,
            sleep_mode, gsm_cell_id, gsm_area_code, digital_input_1,
            digital_input_2, digital_input_3, digital_input_4, digital_output_1,
            digital_output_2, dout1_overcurrent, dout2_overcurrent,
            extended_analog_input_1, extended_analog_input_2, instant_movement,
            iso6709_coordinates, gsm_signal
        ) VALUES (
            $1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
        )
        ON CONFLICT (iot_imei, iot_timestamp) DO NOTHING;
      `;

      let latestRecord = null;

      for (const record of records) {
          try {
              // record.attributes contains the mapped fields from decoder
              const attrs = record.attributes || {};
              
              // Keep track of latest record by timestamp
              if (!latestRecord || new Date(record.timestamp) > new Date(latestRecord.timestamp)) {
                  latestRecord = record;
              }

            await db.query(query, [
                imei,
                record.timestamp,
                record.gps.latitude || null,
                record.gps.longitude || null,
                record.gps.speed || null,
                attrs.internal_battery_voltage,
                attrs.internal_battery_current,
                attrs.internal_battery_percent,
                attrs.external_voltage,
                attrs.external_extended_voltage,
                attrs.analog_input_1,
                attrs.analog_input_2,
                attrs.trip_odometer,
                attrs.total_odometer,
                attrs.x_axis,
                attrs.y_axis,
                attrs.z_axis,
                attrs.sleep_mode,
                attrs.gsm_cell_id,
                attrs.gsm_area_code,
                attrs.digital_input_1,
                attrs.digital_input_2,
                attrs.digital_input_3,
                attrs.digital_input_4,
                attrs.digital_output_1,
                attrs.digital_output_2,
                attrs.dout1_overcurrent,
                attrs.dout2_overcurrent,
                attrs.extended_analog_input_1,
                attrs.extended_analog_input_2,
                attrs.instant_movement,
                attrs.iso6709_coordinates,
                attrs.gsm_signal
            ]);
          } catch (err) {
              console.error('IOTService:handleTelemetry:error', err);
          }
      }
      
      // Update vehicle status with latest record
      if (latestRecord) {
          try {
              const attrs = latestRecord.attributes || {};
              // Update vehicle location and battery
              // Using simplistic battery mapping for now as constants are missing
              // If internal_battery_percent is available, use it, otherwise ignore or use 0
              const battery = attrs.internal_battery_percent ? parseInt(attrs.internal_battery_percent) : undefined;
              
              // Only update if we have valid GPS or battery info to update
              const updateFields = [];
              const values = [];
              let valueIdx = 1;

              if (latestRecord.gps.latitude && latestRecord.gps.longitude) {
                  updateFields.push(`lat = $${valueIdx++}`);
                  values.push(latestRecord.gps.latitude);
                  updateFields.push(`lng = $${valueIdx++}`);
                  values.push(latestRecord.gps.longitude);
              }

              if (battery !== undefined) {
                  updateFields.push(`battery = $${valueIdx++}`);
                  values.push(battery);
              }
              
              if (updateFields.length > 0) {
                  updateFields.push(`updated_at = NOW()`);
                  values.push(imei);
                  
                  const updateQuery = `
                      UPDATE tbl_vehicles 
                      SET ${updateFields.join(', ')}
                      WHERE iot_imei = $${valueIdx}
                  `;
                  
                  await db.query(updateQuery, values);
                  console.log('IOTService:handleTelemetry:vehicleUpdated', { imei });
              }

          } catch (err) {
               console.error('IOTService:handleTelemetry:vehicleUpdateError', err);
          }
      }

      console.log('IOTService:handleTelemetry:saved', { imei, count: records.length });
  },

  revertTimeoutCommands: async () => {
    try {
      console.log("info", {
        message: "IOTService:revertTimeoutCommands:init",
      });

      // Find commands that have timed out
      const res = await db.query(`
                SELECT t1.*, t2.booking_action 
                FROM tbl_iot_command_logs t1
                LEFT JOIN tbl_booking_logs t2 ON t1.booking_log_id = t2.booking_log_id
                WHERE t1.estimated_timeout_at < NOW()
            `);

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
        const imeis = toRetry.map(e => e.imei);
        const newTimeout = moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds").toDate();

        // Bulk Update
        await db.query(`
            UPDATE tbl_iot_command_logs 
            SET retry = retry + 1, estimated_timeout_at = $1
            WHERE imei = ANY($2::text[])
        `, [newTimeout, imeis]);

        // Sequential device send (limitation of device connection)
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
        await IOTService.notifyBulkCommandRetry(toRetry);
      }

      // Handle Failures
      if (toFail.length > 0) {
        const imeis = toFail.map(e => e.imei);

        // Bulk Delete
        await db.query(`
             DELETE FROM tbl_iot_command_logs 
             WHERE imei = ANY($1::text[])
         `, [imeis]);

        // Bulk Log
        console.log("warn", {
          message: "IOTService:revertTimeoutCommands:failed_bulk",
          params: {
            total: toFail.length,
            imeis: imeis
          },
        });

        // Bulk failure notification
        await IOTService.notifyBulkCommandFailure(toFail);
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
};

module.exports = IOTService;
