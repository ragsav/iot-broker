
const express = require('express');
const cors = require('cors');
const deviceManager = require('../services/deviceManagement.service');
const IOTService = require('../services/iot.service');
const { CONSTANTS } = require('../constants');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/commands', async (req, res) => {
    const { imei, command } = req.body;

    if (!imei || !command) {
        return res.status(400).json({ error: 'Missing imei or command' });
    }

    // Check if device is connected via manager
    if (!deviceManager.getSocket(imei)) {
        return res.status(404).json({ error: 'Device not connected' });
    }

    const success = await IOTService.sendCommand({ imei, command });
    if (success) {
        res.json({ success: true, message: 'Command sent' });
    } else {
        res.status(500).json({ error: 'Failed to send command' });
    }
});

// Admin routes
app.post('/api/ban', (req, res) => {
   const { imei } = req.body;
   if (!imei) return res.status(400).json({ error: 'Missing imei' });
   
   deviceManager.ban(imei);
   res.json({ success: true, message: `Device ${imei} banned` });
});

app.post('/api/unban', (req, res) => {
   const { imei } = req.body;
   if (!imei) return res.status(400).json({ error: 'Missing imei' });
   
   deviceManager.unban(imei);
   res.json({ success: true, message: `Device ${imei} unbanned` });
});

app.get('/api/stats', (req, res) => {
    res.json(deviceManager.getStats());
});

function startApiServer() {
    return new Promise((resolve) => {
        app.listen(CONSTANTS.API_PORT, () => {
            console.log(`[API] HTTP API listening on port ${CONSTANTS.API_PORT}`);
            resolve(app);
        });
    });
}

module.exports = startApiServer;
