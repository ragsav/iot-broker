const IOTService = require('../../services/iot.service');
const deviceManager = require('../../services/deviceManagement.service');

const commandController = {}

commandController.executeCommand = async (req, res) => {
    const { imei, command, metadata } = req.body;

    console.log('commandController.executeCommand', req.body);

    if (!imei || !command) {
        console.log('commandController.executeCommand: Missing imei or command');
        return res.status(400).json({ error: 'Missing imei or command' });
    }

    // Check if device is connected via manager
    if (!deviceManager.getSocket(imei)) {
        console.log('commandController.executeCommand: Device not connected');
        return res.status(404).json({ error: 'Device not connected' });
    }

    const success = await IOTService.sendCommand({ imei, command, metadata });
    if (success) {
        console.log('commandController.executeCommand: Command sent');
        res.json({ success: true, message: 'Command sent' });
    } else {
        console.log('commandController.executeCommand: Failed to send command');
        res.status(500).json({ error: 'Failed to send command' });
    }
}
module.exports = {commandController};
