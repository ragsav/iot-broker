# Detailed Booking & IoT Lifecycle Analysis

This document provides a highly detailed, step-by-step analysis of the function calls, data flows, and system interactions for the Booking and IoT lifecycles in the `hover_mono_iot` service.

---

## 1. Booking Lifecycle (Command Request)

The Booking Lifecycle manages the flow of commands (e.g., "Start Vehicle", "End Booking") from the external API to the IoT device and back.

### Phase 1: API Request & Validation
**Trigger**: External `POST` request to `/api/v1/command`.

1.  **`api/routes/command.route.js`**:
    *   **`router.post(...)`**: Initializes the route handling.
    *   **`authMiddleware.checkApiKey`**: Middleware checks `req.header('x-api-key')` (implied) against `CONSTANTS.API_KEY`.
    *   **`commandController.executeCommand`**: Passes control to the controller.

2.  **`api/controllers/command.controller.js`**:
    *   **`executeCommand(req, res)`**:
        *   **Input**: `req.body` containing `{ imei, command, booking_log_id }`.
        *   **Validation**: Checks `if (!imei || !command)`. Returns `400` error if failed.
        *   **Connection Check**: Calls `deviceManager.getSocket(imei)`.
            *   *Source*: `services/deviceManagement.service.js`.
            *   *Logic*: Accesses `this.deviceSockets` Map.
            *   *Result*: If `undefined`, returns `404 Device not connected`.
        *   **Service Call**: Calls `IOTService.sendCommand({ imei, command, booking_log_id })`.

### Phase 2: Service Logic & Command Logging
3.  **`services/iot.service.js`**:
    *   **`sendCommand({ imei, command, booking_log_id })`**:
        *   **Clear Pending**: `db.query('DELETE FROM tbl_iot_command_logs WHERE imei = $1', [imei])`.
            *   *Purpose*: Ensures only one active command per device exists, preventing queue conflicts.
        *   **Persist Command**: `db.query('INSERT INTO tbl_iot_command_logs ...')`.
            *   *Values*: `imei`, `command`, `booking_log_id`, `estimated_timeout_at` (Calculated using `moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds")`).
            *   *Purpose*: Starts the timeout timer and allows matching the asynchronous response later.
        *   **Send Trigger**: Calls `deviceManager.sendCommand(imei, command)`.
        *   **Return**: Returns `true` if sent, `false` (caught error) otherwise.

### Phase 3: Protocol Encoding & Network Transmission
4.  **`services/deviceManagement.service.js`**:
    *   **`sendCommand(imei, command)`**:
        *   **Socket Lookup**: `this.deviceSockets.get(imei)`.
        *   **Encoder Init**: Instantiates `Tft100Encoder` (implicitly via require).
        *   **Encoding**: Calls `encoder.encodeCommand(command)`.

5.  **`protocols/tft100/encoder.js`**:
    *   **`encodeCommand(command)`**:
        *   **Buffer Creation**: Converts `command` string to ASCII Buffer.
        *   **Packet Construction (Codec 12)**:
            1.  `Codec ID`: 0x0C (Codec 12 for Commands).
            2.  `Command Count`: 1.
            3.  `Type`: 0x05 (Command).
            4.  `Command Size`: 4-byte Integer.
            5.  `Command Data`: The actual command string.
            6.  `Command Count 2`: 1 (Confirmation).
        *   **CRC Calculation**: Calls `this.calculateCrc16(dataBuffer)`.
        *   **Framing**: Wraps data in `Preamble` (0x00000000), `Length`, and `CRC`.
        *   **Return**: Returns the final binary `Buffer`.

6.  **`services/deviceManagement.service.js`** (Resume `sendCommand`):
    *   **`socket.write(packet)`**: Flushes the binary buffer to the TCP stream.
    *   **Return**: Returns `true`.

### Phase 4: Device Response & Processing
**Trigger**: Device responds with a TCP packet.

7.  **`handlers/socket.handler.js`**:
    *   **Flow**: `socket` -> `pipe` -> `Tft100Framer`.
    *   **`framer.on('data')`**: Emits a complete packet buffer.
    *   **Handler**: Calls `packetHandler.handlePacket(socket, packet)`.

8.  **`handlers/packet.handler.js`**:
    *   **`handlePacket(socket, packet)`**:
        *   **Decoding**: Calls `this.decoder.decode(packet)`.

9.  **`protocols/tft100/decoder.js`**:
    *   **`decode(buffer)`**: Identifies Codec 12 header (Command Response).
    *   **`decodeData(buffer)`**: Calls `decodeCommandResponse(buffer, offset, count)`.
    *   **`decodeCommandResponse`**: Extracts the response string.
    *   **Return**: `{ type: RESPONSE, respType: 5|6, data: responseString }`.

10. **`handlers/packet.handler.js`** (Resume `handlePacket`):
    *   **Switch Case**: Matches `CONSTANTS.TFT100.PACKET_TYPE.RESPONSE`.
    *   **Routing**: Calls `this.handleResponse(socket, decoded)`.

11. **`handlers/packet.handler.js`**:
    *   **`handleResponse(socket, decoded)`**:
        *   **Validation**: Checks `socket.authenticated`.
        *   **Service Trigger**: Calls `IOTService.confirmCommandExecution({ imei, command: decoded.data })`.

### Phase 5: Confirmation & Webhook Notification
12. **`services/iot.service.js`**:
    *   **`confirmCommandExecution({ imei, command })`**:
        *   **Log Lookup**: `db.query('SELECT ... FROM tbl_iot_command_logs ...')`.
            *   *Join*: `LEFT JOIN tbl_booking_logs` to retrieve the associated `booking_action`.
        *   **Validation**: If no log found, stops (handling unsolicited responses).
        *   **Cleanup**: `db.query('DELETE FROM tbl_iot_command_logs ...')`.
        *   **Notification**: Calls `notifyCommandSuccess`.

13. **`services/iot.service.js`**:
    *   **`notifyCommandSuccess(data)`**:
        *   **Payload Construction**: `{ identified: true, imei, command, response, booking_action, etc. }`.
        *   **Webhook**: `axios.post(CONSTANTS.NOTIFICATION_URL + '/webhooks/iot/v1/command/confirm', data)`.

---

## 2. IoT Lifecycle (Telemetry & Connection)

The IoT Lifecycle manages device connectivity, authentication, and the ingestion of sensor data.

### Phase 1: Connection & Authentication
**Trigger**: Device opens TCP connection to port 9000.

1.  **`index.js`**:
    *   **`net.createServer(socket => setupSocket(socket))`**: Accepts connection and delegates.

2.  **`handlers/socket.handler.js`**:
    *   **`setupSocket(socket)`**:
        *   **Init**: Sets default `authenticated = false`, `imei = null`.
        *   **Config**: `socket.setKeepAlive(true, 60000ms)`, `socket.setTimeout(60000ms)`.
        *   **Framer**: Instantiates `Tft100Framer` and pipes socket.

3.  **Device Login**:
    *   Device sends Login Packet (IMEI).
    *   **Decoder**: `decoder.decode` -> `decodeLogin` -> returns `{ type: LOGIN, imei }`.
    *   **PacketHandler**: Calls `handleLogin(socket, decoded)`.

4.  **`handlers/packet.handler.js`**:
    *   **`handleLogin(socket, decoded)`**:
        *   **Validation**: Regex check on IMEI.
        *   **Ban Check**: `deviceManager.isBanned(imei)`.
        *   **Registration**: Calls `deviceManager.addConnection(socket, imei)`.
            *   *DeviceManager*: Updates `deviceSockets` (IMEI -> Socket) and `socketMetadata`.
        *   **Ack**: `socket.write(Buffer.from([0x01]))`.

### Phase 2: Telemetry Ingestion
**Trigger**: Device sends AVL Data Packet (Codec 8/8E).

5.  **`protocols/tft100/decoder.js`**:
    *   **`decodeData(buffer)`**:
        *   Parses **Timestamp**, **GPS** (Lat, Lng, Alt, Speed, Angle, Satellites).
        *   Parses **IO Elements**: loops through 1-byte, 2-byte, 4-byte, 8-byte, and X-byte IO sections.
        *   **Mapping**: Maps specific IO IDs to named attributes (e.g., `67 -> internal_battery_voltage`, `113 -> internal_battery_percent`, `239 -> ignition`).
    *   **Return**: `{ type: DATA, records: [ ... ] }`.

6.  **`handlers/packet.handler.js`**:
    *   **`handleData(socket, decoded)`**:
        *   **Log**: Logs packet receipt.
        *   **Service Call**: `IOTService.handleTelemetry(socket.imei, decoded.records)`.
        *   **Ack**: Calls `encoder.encodeDataResponse(decoded.count)` -> `socket.write(ack)`.

### Phase 3: Data Persistence & Vehicle State
7.  **`services/iot.service.js`**:
    *   **`handleTelemetry(imei, records)`**:
        *   **Loop**: Iterates over `records`.
        *   **Insert Query**: `db.query('INSERT INTO tbl_iot_telemetry_data ...')`.
            *   *Mapping*: Maps ~30 decoded attributes to table columns.
        *   **Latest Record**: Tracks the record with the most recent timestamp.
    *   **Vehicle Update**:
        *   **Condition**: If `latestRecord` exists.
        *   **Update Query**: `UPDATE tbl_vehicles SET ...`.
            *   *Fields*: `lat`, `lng`, `battery`, `updated_at`.
            *   *Purpose*: Updates the real-time status of the vehicle fleet.

### Phase 4: Command Timeout & Retry (Background)
**Trigger**: Cron Job (every minute).

8.  **`jobs/cron.job.js`**:
    *   **`revertTimedOutIOTCommandsCronjob()`**:
        *   Calculates schedule based on `CONSTANTS.IOT_COMMAND_TIMEOUT`.
        *   Calls `IOTService.revertTimeoutCommands`.

9.  **`services/iot.service.js`**:
    *   **`revertTimeoutCommands()`**:
        *   **Select Timeouts**: `SELECT ... FROM tbl_iot_command_logs WHERE estimated_timeout_at < NOW()`.
        *   **Retry Logic**:
            *   Filter logs by `retry_count`.
            *   **Recycle**: If count < Max Retry:
                *   `UPDATE tbl_iot_command_logs SET retry = retry + 1, estimated_timeout_at = new_time`.
                *   Calls `deviceManager.sendCommand(imei, command)` again.
                *   Calls `notifyBulkCommandRetry`.
            *   **Fail**: If count >= Max Retry:
                *   `DELETE FROM tbl_iot_command_logs`.
                *   Calls `notifyBulkCommandFailure` (Webhook).
