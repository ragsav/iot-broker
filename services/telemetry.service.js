const db = require('../db');
const { CONSTANTS } = require('../constants');
const NotificationService = require('./notification.service');

class TelemetryService {
    static async saveIOTTelemetryData(imei, records) {
        if (!records || records.length === 0) return;

        const client = await db.pool.connect();

        try {
            await client.query('BEGIN');

            // Build a single multi-row INSERT
            const columns = [
                'iot_imei', 'iot_timestamp', 'timestamp', 'latitude', 'longitude', 'speed',
                'internal_battery_voltage', 'internal_battery_current', 'internal_battery_percent',
                'external_voltage', 'external_extended_voltage', 'analog_input_1', 'analog_input_2',
                'trip_odometer', 'total_odometer', 'x_axis', 'y_axis', 'z_axis',
                'sleep_mode', 'gsm_cell_id', 'gsm_area_code', 'digital_input_1',
                'digital_input_2', 'digital_input_3', 'digital_input_4', 'digital_output_1',
                'digital_output_2', 'dout1_overcurrent', 'dout2_overcurrent',
                'extended_analog_input_1', 'extended_analog_input_2', 'instant_movement',
                'iso6709_coordinates', 'gsm_signal'
            ];

            const PARAMS_PER_ROW = 33; // 34 columns, but 'timestamp' uses NOW() inline
            const finalValues = [];
            const finalRowPlaceholders = [];
            let latestRecord = null;

            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                const attrs = record.attributes || {};

                // Track latest record by timestamp
                if (!latestRecord || new Date(record.timestamp) > new Date(latestRecord.timestamp)) {
                    latestRecord = record;
                }

                const baseIdx = finalValues.length + 1;
                const rowVals = [
                    imei,
                    record.timestamp,
                    record.gps.latitude || null,
                    record.gps.longitude || null,
                    record.gps.speed || null,
                    attrs.internal_battery_voltage ?? null,
                    attrs.internal_battery_current ?? null,
                    attrs.internal_battery_percent ?? null,
                    attrs.external_voltage ?? null,
                    attrs.external_extended_voltage ?? null,
                    attrs.analog_input_1 ?? null,
                    attrs.analog_input_2 ?? null,
                    attrs.trip_odometer ?? null,
                    attrs.total_odometer ?? null,
                    attrs.x_axis ?? null,
                    attrs.y_axis ?? null,
                    attrs.z_axis ?? null,
                    attrs.sleep_mode ?? null,
                    attrs.gsm_cell_id ?? null,
                    attrs.gsm_area_code ?? null,
                    attrs.digital_input_1 ?? null,
                    attrs.digital_input_2 ?? null,
                    attrs.digital_input_3 ?? null,
                    attrs.digital_input_4 ?? null,
                    attrs.digital_output_1 ?? null,
                    attrs.digital_output_2 ?? null,
                    attrs.dout1_overcurrent ?? null,
                    attrs.dout2_overcurrent ?? null,
                    attrs.extended_analog_input_1 ?? null,
                    attrs.extended_analog_input_2 ?? null,
                    attrs.instant_movement ?? null,
                    attrs.iso6709_coordinates ?? null,
                    attrs.gsm_signal ?? null
                ];

                finalValues.push(...rowVals);

                // Build placeholders: $base..$base+N, with NOW() + offset for the 'timestamp' column
                // Each row gets a microsecond offset to avoid duplicate key violations in batch inserts
                const placeholders = [];
                let paramIdx = baseIdx;
                for (let c = 0; c < columns.length; c++) {
                    if (columns[c] === 'timestamp') {
                        placeholders.push(`NOW() + (${i} * interval '1 microsecond')`);
                    } else {
                        placeholders.push(`$${paramIdx++}`);
                    }
                }
                finalRowPlaceholders.push(`(${placeholders.join(', ')})`);
            }

            const insertQuery = `
                INSERT INTO tbl_iot_telemetry_data (${columns.join(', ')})
                VALUES ${finalRowPlaceholders.join(',\n                       ')}
            `;

            await client.query(insertQuery, finalValues);
            await client.query('COMMIT');

            console.log('TelemetryService:saveIOTTelemetryData:saved', { imei, count: records.length });

            // Optionally notify consuming app about new telemetry data via webhook
            if (CONSTANTS.TELEMETRY_WEBHOOK_ENABLED && latestRecord) {
                NotificationService.notifyTelemetryData({
                    imei,
                    recordCount: records.length,
                    latestTimestamp: latestRecord.timestamp,
                    latestGps: latestRecord.gps,
                    latestAttributes: latestRecord.attributes || {},
                }).catch(err => console.error('TelemetryService:webhookError', err.message));
            }

        } catch (err) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('TelemetryService:saveIOTTelemetryData:error', err);
        } finally {
            client.release();
        }
    }
}

module.exports = TelemetryService;
