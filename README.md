# iot-broker

A highly scalable, independent TCP server and IoT Gateway built in Node.js, specifically designed to interface with TFT100 IoT devices. It handles real-time telemetry ingestion, remote command execution, and robust connection management, perfectly decoupled from legacy monolithic architectures.

## 🚀 Features

- **Dedicated TCP Server**: Built-in native TCP socket management to maintain persistent connections with IoT devices.
- **RESTful API**: Manage connected devices and trigger remote commands safely via a secured REST API (`x-api-key`).
- **Telemetry Ingestion**: Scaffolding for parsing high-throughput vehicle metrics and routing them to message queues.
- **Horizontal Scalability**: Fully supports multi-instance deployments. Utilizes PostgreSQL atomic row-level locks (`FOR UPDATE SKIP LOCKED`) to prevent race conditions during command retries across multiple scaled containers.
- **Command State Tracking**: Retains a permanent, FIFO-based history of all commands sent to devices (Pending, Completed, Failed) rather than ephemeral queues.
- **Webhook Notifier**: Asynchronously dispatches success, failure, and bulk retry notifications to your core backend via HTTP Webhooks.
- **Clean Architecture**: Built using a strict DAO (Data Access Object) pattern, segregating raw SQL from core business logic entirely.

---

## 🏗 System Architecture

1. **Device Management**: Tracks active socket connections (`services/deviceManagement.service.js`).
2. **Command Pipeline**: REST API (`api/controllers/command.controller.js`) queues commands into Postgres.
3. **Chron Retries**: Background jobs (`jobs/cron.job.js`) automatically retry timed-out pending commands up to 3 times before failing them.
4. **Data Access (DAO)**: All database logic is abstracted into `dao/iotCommand.dao.js`.
5. **Notification Layer**: `services/notification.service.js` dispatches status updates to an external hook.
6. **Telemetry Layer**: `services/telemetry.service.js` parses incoming location/sensor data.

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/iot_db
API_KEY=your_secure_api_key_here
```

Constants such as `BROKER_PORT` (9000), `API_PORT` (8091), and `NOTIFICATION_URL` can be modified inside `constants.js`.

---

## 🛠 Installation & Execution

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start the Server:**
   ```bash
   npm start
   ```

---

## 📡 API Endpoints

*All endpoints require the `x-api-key` header for authentication.*

- **`GET /api/v1/devices`** - List all currently connected device IMEIs.
- **`GET /api/v1/devices/:imei`** - Get connection metadata for a specific device.
- **`GET /api/v1/stats`** - Get server performance and connection statistics.
- **`POST /api/v1/command`** - Queue a command for a connected device.
  - Body: `{ "imei": "350612345678901", "command": "VEHICLE_START", "booking_log_id": "abc1234" }`

---

## 🧪 Postman Collection

A sanitized Postman collection is included in the root directory: `collection.postman_collection.json`. 
Simply import it into Postman and set the `apiKey` variable in your active environment.

---

## 🔍 Detailed Lifecycle Analysis

The following sections provide a highly detailed, step-by-step analysis of the function calls, data flows, and system interactions for the Booking and IoT lifecycles in the `iot-broker` service.

### 1. Booking Lifecycle (Command Request)

The Booking Lifecycle manages the flow of commands (e.g., "Start Vehicle", "End Booking") from the external API to the IoT device and back.

#### Phase 1: API Request & Validation
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

#### Phase 2: Service Logic & Command Logging
3.  **`services/iot.service.js`**:
    *   **`IOTService.sendCommand({ imei, command, booking_log_id, force })`**:
        *   **Check Pending**: Checks `IotCommandDao.hasPendingCommands(imei)` (if `force = false`).
            *   *Purpose*: Ensures only one active command per device exists to prevent spamming backlogged devices.
        *   **Persist Command**: Calls `IotCommandDao.insertCommand({...})`.
            *   *Values*: `imei`, `command`, `booking_log_id`, `estimated_timeout_at` (Calculated using `moment().add(CONSTANTS.IOT_COMMAND_TIMEOUT, "seconds")`).
            *   *Purpose*: Starts the timeout timer and allows matching the asynchronous response later.
        *   **Send Trigger**: Calls `deviceManager.sendCommand(imei, command)`.
        *   **Return**: Returns `true` if sent, `false` (caught error) otherwise.

#### Phase 3: Protocol Encoding & Network Transmission
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

#### Phase 4: Device Response & Processing
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

#### Phase 5: Confirmation & Webhook Notification
12. **`services/iot.service.js`**:
    *   **`IOTService.confirmCommandExecution({ imei, command })`**:
        *   **Log Lookup**: `IotCommandDao.findEarliestPendingCommand(imei)`.
            *   *Fetch*: Retrieves the oldest FIFO `PENDING` command entry.
        *   **Validation**: If no log found, stops (handling unsolicited responses).
        *   **Status Update**: `IotCommandDao.updateCommandStatus(logEntry.id, 'COMPLETED')`.
        *   **Notification**: Calls `NotificationService.notifyCommandSuccess`.

13. **`services/notification.service.js`**:
    *   **`NotificationService.notifyCommandSuccess(data)`**:
        *   **Payload Construction**: `{ identified: true, imei, command, response, etc. }`.
        *   **Webhook**: `axios.post(CONSTANTS.NOTIFICATION_URL + '/webhooks/iot/v1/command/confirm', data)`.

---

### 2. IoT Lifecycle (Telemetry & Connection)

The IoT Lifecycle manages device connectivity, authentication, and the ingestion of sensor data.

#### Phase 1: Connection & Authentication
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

#### Phase 2: Telemetry Ingestion
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
        *   **Service Call**: `TelemetryService.handleTelemetry(socket.imei, decoded.records)`.
        *   **Ack**: Calls `encoder.encodeDataResponse(decoded.count)` -> `socket.write(ack)`.

#### Phase 3: Data Queueing
7.  **`services/telemetry.service.js`**:
    *   **`TelemetryService.handleTelemetry(imei, records)`**:
        *   **Loop**: Receives decoded parameter `records`.
        *   **Broker**: Telemetry attributes and locations are structured to be dispatched asynchronously to a Message Broker (RabbitMQ/Kafka) in the future to keep the TCP pipeline fully unblocked and lightweight.

#### Phase 4: Command Timeout & Retry (Background)
**Trigger**: Cron Job (every minute).

8.  **`jobs/cron.job.js`**:
    *   **`revertTimedOutIOTCommandsCronjob()`**:
        *   Calculates schedule based on `CONSTANTS.IOT_COMMAND_TIMEOUT`.
        *   Calls `IOTService.revertTimeoutCommands`.

9.  **`services/iot.service.js`**:
    *   **`IOTService.revertTimeoutCommands()`**:
        *   **Concurrency**: Opens pg client and `BEGIN` transaction.
        *   **Locking Select**: `IotCommandDao.lockTimedOutPendingCommands(client)`. Uses `FOR UPDATE SKIP LOCKED` so horizontally scaled nodes do not run retries simultaneously on the same rows.
        *   **Retry Logic**:
            *   Filter logs by `retry_count`.
            *   **Recycle**: If count < Max Retry:
                *   `IotCommandDao.incrementRetriesBulk(...)`.
                *   Calls `deviceManager.sendCommand(imei, command)` again.
                *   Calls `NotificationService.notifyBulkCommandRetry(...)`.
            *   **Fail**: If count >= Max Retry:
                *   `IotCommandDao.updateStatusBulk(client, ..., 'FAILED')`. Updates history to failed state.
                *   Calls `NotificationService.notifyBulkCommandFailure(...)`.
