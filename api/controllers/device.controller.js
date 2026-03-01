const deviceManager = require('../../services/deviceManagement.service');
const DeviceDao = require('../../dao/device.dao');
const deviceCache = require('../../services/deviceCache.service');

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

/**
 * GET /v1/devices/registered
 * Returns all registered devices from the database
 */
deviceController.getRegisteredDevices = async (req, res) => {
    try {
        const devices = await DeviceDao.getAllDevices();
        res.json({ success: true, count: devices.length, devices });
    } catch (err) {
        console.error('[API] Error getting registered devices:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

/**
 * POST /v1/devices
 * Adds a new device
 */
deviceController.addDevice = async (req, res) => {
    const { imei } = req.body;
    if (!imei) {
        return res.status(400).json({ success: false, error: 'Missing IMEI parameter' });
    }

    try {
        // Basic IMEI validation
        if (!/^\d{15}$/.test(imei)) {
            return res.status(400).json({ success: false, error: 'Invalid IMEI format (must be 15 digits)' });
        }

        const existing = await DeviceDao.getDeviceByImei(imei);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Device with this IMEI already exists' });
        }

        const newDevice = await DeviceDao.addDevice(imei);
        deviceCache.addDevice(imei);

        res.status(201).json({ success: true, device: newDevice });
    } catch (err) {
        console.error('[API] Error adding device:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

/**
 * PUT /v1/devices/:id
 * Updates an existing device
 */
deviceController.updateDevice = async (req, res) => {
    const { id } = req.params;
    const { imei } = req.body;

    if (!imei) {
        return res.status(400).json({ success: false, error: 'Missing new IMEI parameter' });
    }

    try {
        if (!/^\d{15}$/.test(imei)) {
            return res.status(400).json({ success: false, error: 'Invalid IMEI format (must be 15 digits)' });
        }

        const existingDevice = await DeviceDao.getDeviceById(id);
        if (!existingDevice) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }

        // Check for IMEI conflict
        const imeiConflict = await DeviceDao.getDeviceByImei(imei);
        if (imeiConflict && imeiConflict.device_id.toString() !== id.toString()) {
            return res.status(409).json({ success: false, error: 'Another device with this IMEI already exists' });
        }

        const updatedDevice = await DeviceDao.updateDevice(id, imei);
        deviceCache.updateDevice(existingDevice.device_imei, imei);

        res.json({ success: true, device: updatedDevice });
    } catch (err) {
        console.error('[API] Error updating device:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

/**
 * DELETE /v1/devices/:id
 * Deletes a device
 */
deviceController.deleteDevice = async (req, res) => {
    const { id } = req.params;

    try {
        const device = await DeviceDao.getDeviceById(id);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }

        await DeviceDao.deleteDevice(id);
        deviceCache.removeDevice(device.device_imei);

        // Disconnect the device if it's currently connected
        const activeSocket = deviceManager.getSocket(device.device_imei);
        if (activeSocket) {
            console.log('[API] Disconnecting deleted device:', device.device_imei);
            activeSocket.destroy();
        }

        res.json({ success: true, message: 'Device deleted successfully' });
    } catch (err) {
        console.error('[API] Error deleting device:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

module.exports = { deviceController };
