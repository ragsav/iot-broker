const IOTService = require('../../services/iot.service');
const deviceManager = require('../../services/deviceManagement.service');

const commandController = {}

commandController.executeCommand = async (req, res) => {
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
}
module.exports = {commandController};
