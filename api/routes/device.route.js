const express = require('express');
const router = express.Router({ mergeParams: true });
const { authMiddleware } = require('../middlewares/auth.middleware');
const { deviceController } = require('../controllers/device.controller');

router.get('/v1/devices', authMiddleware.checkApiKey, deviceController.getAllDevices);
router.get('/v1/devices/:imei', authMiddleware.checkApiKey, deviceController.getDeviceByImei);
router.get('/v1/stats', authMiddleware.checkApiKey, deviceController.getStats);

module.exports = { deviceRouter: router };
