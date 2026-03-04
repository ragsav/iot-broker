# IoT Connect (Broker & Gateway)

A scalable, independent TCP server and IoT Gateway built in Node.js, specifically designed to interface with Teltonika TFT100 (and similar) IoT devices. It handles real-time telemetry ingestion, remote command execution, and robust connection management as a standalone, plug-and-play module decoupled from any specific host application.

## 🚀 Features

- **Dedicated TCP Server**: Built-in native TCP socket management to maintain persistent connections with IoT devices.
- **RESTful API**: Manage connected devices and trigger remote commands safely via a secured REST API (`x-api-key`).
- **Telemetry Ingestion**: Decodes high-throughput vehicle metrics directly into Postgres and routes them to webhooks.
- **Horizontal Scalability**: Fully supports multi-instance deployments using PostgreSQL atomic row-level locks (`FOR UPDATE SKIP LOCKED`) to prevent race conditions during command retries.
- **Command State Tracking**: Retains a permanent history of all commands sent to devices (Pending, Completed, Failed) with configurable retries.
- **Metadata Roundtripping**: Attach arbitrary JSON `metadata` to any command. The gateway stores it and returns it inside the webhook when the command completes.
- **Webhook Notifier**: Asynchronously dispatches success, failure, telemetry data, and bulk retry notifications to your core backend via HTTP Webhooks.

---

## 🏗 System Architecture

The gateway acts as the middleman between your **Host Application** (Backend) and your physical **IoT Devices**.

1. **Host Application** triggers commands via the `POST /api/v1/command` endpoint.
2. **Command Pipeline** (`api/controllers/command.controller.js`) queues commands into the PostgreSQL database (`tbl_iot_command_logs`).
3. **TCP Broker** (`index.js` & `handlers/socket.handler.js`) maintains active device connections and writes binary encoded commands to the active socket.
4. **Packet Handlers** (`handlers/packet.handler.js`) asynchronously decode inbound binary responses and telemetry streams from devices.
5. **Telemetry Layer** (`services/telemetry.service.js`) parses incoming location/sensor data and inserts logs into the database.
6. **Notification Layer** (`services/notification.service.js`) dispatches HTTP webhooks back to the Host Application containing command execution confirmations.
7. **Cron Retries** (`jobs/cron.job.js`) background jobs automatically retry and eventually fail timed-out commands.

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/iot_db
API_PORT=8091
BROKER_PORT=9000
IOT_API_KEY=your_secure_api_key_here
NOTIFICATION_URL=http://your-backend.com
TELEMETRY_WEBHOOK_ENABLED=true
VALIDATE_COMMAND_RESPONSE=true
```

## 🛠 Database Setup

The project uses Prisma purely for schema documentation and migration management. The gateway requires exactly two tables (`tbl_iot_command_logs`, `tbl_iot_telemetry_data`).

```bash
npx prisma db push
```

---

## 📡 API Endpoints

*All endpoints require the `x-api-key` header for authentication.*

- **`GET /api/v1/devices`** - List all currently connected device IMEIs.
- **`GET /api/v1/devices/:imei`** - Get connection metadata for a specific device.
- **`GET /api/v1/stats`** - Get server performance and connection statistics.
- **`POST /api/v1/command`** - Queue a command for a connected device.
  - Body: 
    ```json
    { 
      "imei": "350612345678901", 
      "command": "setdigout 1?", 
      "metadata": { "job_id": "123", "action": "START" } 
    }
    ```

---

## 🪝 Webhooks

The gateway dispatches HTTP POST requests to `NOTIFICATION_URL`.

### Command Success
Dispatched when a device confirms a command.
`POST /webhooks/iot/v1/command/confirm`
```json
{
  "identified": true,
  "imei": "350612345678901",
  "command": "setdigout 1?",
  "response": "DOUT1:1",
  "metadata": { "job_id": "123", "action": "START" }
}
```

### Command Failure
Dispatched when a command permanently fails after exhausting all retries.
`POST /webhooks/iot/v1/command/bulk_failure`
```json
{
  "entries": [
    {
      "command_log_id": "1",
      "imei": "350612345678901",
      "command": "setdigout 1?",
      "metadata": { "job_id": "123", "action": "START" }
    }
  ]
}
```

### Telemetry Update
Dispatched when new data is received (if `TELEMETRY_WEBHOOK_ENABLED=true`).
`POST /webhooks/iot/v1/telemetry`
```json
{
  "imei": "350612345678901",
  "recordCount": 5,
  "latestTimestamp": "2023-10-01T12:00:00Z",
  "latestGps": { "latitude": 40.7128, "longitude": -74.0060, "speed": 45 },
  "latestAttributes": { "internal_battery_percent": 85 }
}
```

---

## 🔍 Detailed Lifecycle Analysis

The following sections provide a detailed step-by-step analysis of the asynchronous data flows between your Backend, the Gateway, and the IoT Device.

### 1. The Command Lifecycle

1. **Host App Issues Command**: Your backend decides an IoT actions needs to happen (e.g., unlocking a vehicle). It calls the Gateway's `POST /api/v1/command` endpoint, providing the `imei`, the raw string `command`, and an arbitrary JSON `metadata` object (e.g., `{"workflow_id":"W-100"}`).
2. **Gateway Validates Structure**: The REST API controller verifies the device is actively tracking a TCP socket with the matching `imei`.
3. **Database Ledger**: The `iot.service.js` inserts a `PENDING` command log into `tbl_iot_command_logs` with a future `estimated_timeout_at` value. It saves the `metadata` JSON blob exactly as passed.
4. **Binary Encoding**: The command string is passed to the Device Manager, encoded into a specific protocol (e.g., Teltonika Codec 12), and flushed to the active TCP Socket buffer. Current execution on the REST API ends here, returning an immediate `200 OK` ("Command sent").
5. **Asynchronous Wait**: The Gateway goes idle, maintaining the connection.
6. **Device Response**: The physical IoT hardware executes the requested action and responds with a binary TCP payload containing a confirmation string.
7. **Decoding & Matching**: The Gateway's `packet.handler.js` detects the Codec 12 response, decodes it into a string, and triggers `iot.service.js` to look for the oldest `PENDING` log for that `imei`.
8. **Finalization & Webhooks**: The log is marked `COMPLETED`. The Gateway reads the original `metadata` object from the database row and fires a webhook to `NOTIFICATION_URL` containing BOTH the hardware's confirmation string and the original `metadata`. Your backend receives this hook and advances its own business logic logic (e.g. marking the workflow complete).

### 2. Edge Case Scenarios

Because IoT ecosystems are distributed and run over unstable 2G/4G networks, the Gateway is designed to be resilient in split-brain paradigms.

#### Scenario A: The IoT Network is down (Device -> Gateway link fails)
*   **Trigger**: The broker tries to write a command to a socket, but the device is actually offline (half-open connection).
*   **Handling**: The REST API successfully queued the `PENDING` command, but the device never responds over the TCP socket. After `IOT_COMMAND_TIMEOUT` seconds, the Background Cron Job queries the database for timed-out commands. It increments the generic retry counter by 1. The broker attempts to write the binary packet again over the actively tracked socket. This repeats `DEFAULT_MAX_IOT_COMMAND_RETRY` times.
*   **Outcome**: If the device never comes online or the socket ultimately drops, the Cron Job eventually marks the database row as `FAILED` and dispatches the `bulk_failure` webhook to the Host App.

#### Scenario B: The Caller Network is down (Gateway -> Host App link fails)
*   **Trigger**: A device successfully executes a command and the Gateway attempts to fire the completion webhook (`NOTIFICATION_URL`), but the Host App's API is temporarily unreachable (e.g., 502 Bad Gateway).
*   **Handling**: The Gateway marks the command `COMPLETED` in the database immediately after receiving the TCP bytes. The webhook attempt is fired but fails loudly in the Gateway's internal logs (`axios.post` exception).
*   **Outcome**: Because the Gateway does not implement complex webhook retry queues (it assumes Host APIs are highly available), the Host App misses the webhook. However, Host Apps can periodically reconcile state manually by directly querying `tbl_iot_command_logs` via standard PostgreSQL queries or Prisma, searching for pending jobs in their own tables that align with `COMPLETED` commands in the Gateway database.

#### Scenario C: Simultaneous/Spammy Commands
*   **Trigger**: The Host App fires multiple commands to the same IMEI in rapid succession.
*   **Handling — Same Command (Duplicates)**: If the same command string is fired 5 times (e.g., "Start Vehicle" x5), the `sendCommand` routine marks all older `PENDING` entries **with the same command string** as `FAILED` (superseded). Only the latest one stays `PENDING`. The device may execute duplicates, but confirmation matching only resolves the most recent entry.
*   **Handling — Different Commands (Concurrent)**: If different command strings are fired (e.g., "Start Vehicle", then "getinfo"), each command gets its own independent `PENDING` entry. They coexist concurrently. When a response arrives, the Gateway matches it to the correct `PENDING` log by validating the response against each command's expected response pattern (defined in `IOT_COMMANDS`). For custom/raw commands not defined in `IOT_COMMANDS`, the Gateway falls back to oldest-first (FIFO) matching.
*   **Outcome**: Duplicate commands are de-duplicated to prevent stale webhook noise, while genuinely different commands execute and confirm independently.

#### Scenario D: Socket Drop Before Acknowledgement
*   **Trigger**: The device receives the command, executes it physically (the vehicle unlocks), but drives into a tunnel and loses 4G before sending the TCP response back.
*   **Handling**: From the Gateway's perspective, the device never executed the command. The Cron Job eventually triggers a retry. The Gateway sends the "Start Vehicle" binary packet again once the device reconnects.
*   **Outcome**: Teltonika devices handle redundant commands natively (responding with "Already set to 1"). The Gateway parses these secondary confirmation strings equally and marks the command `COMPLETED`, firing the success webhook.
