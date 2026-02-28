const deviceManager = require('../../services/deviceManagement.service');

const deviceController = {};

/**
 * GET /v1/devices
 * Returns all currently connected device IMEIs
 */
deviceController.getAllDevices = (req, res) => {
    const imeis = deviceManager.getAllDeviceImies();
    const devices = imeis.map(imei => {
        const info = deviceManager.getDeviceInfo(imei);
        return {
            imei,
            connectedAt: info?.connectedAt || null,
            remoteAddress: info?.remoteAddress || null,
        };
    });

    res.json({
        success: true,
        count: devices.length,
        devices
    });
};

/**
 * GET /v1/devices/:imei
 * Returns connection info for a specific device
 */
deviceController.getDeviceByImei = (req, res) => {
    const { imei } = req.params;

    if (!imei) {
        return res.status(400).json({ success: false, error: 'Missing IMEI parameter' });
    }

    const info = deviceManager.getDeviceInfo(imei);
    if (!info) {
        return res.status(404).json({ success: false, error: 'Device not connected' });
    }

    res.json({
        success: true,
        device: {
            imei: info.imei,
            connectedAt: info.connectedAt,
            remoteAddress: info.remoteAddress,
            remotePort: info.remotePort,
        }
    });
};

/**
 * GET /v1/stats
 * Returns server stats (connected device count, uptime, memory)
 */
deviceController.getStats = (req, res) => {
    const stats = deviceManager.getStats();
    res.json({ success: true, ...stats });
};

module.exports = { deviceController };
