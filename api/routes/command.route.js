const express = require('express');
const router = express.Router({ mergeParams: true });
const {authMiddleware} = require('../middlewares/auth.middleware');
const { commandController } = require('../controllers/command.controller');

router.post('/v1/command', authMiddleware.checkApiKey, commandController.executeCommand);

module.exports = {commandRouter:router};