
const express = require('express');
const cors = require('cors');
const { CONSTANTS } = require('../constants');
const { commandRouter } = require('./routes/command.route');
const { deviceRouter } = require('./routes/device.route');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', commandRouter);
app.use('/api', deviceRouter);

function startApiServer() {
    return new Promise((resolve) => {
        app.listen(CONSTANTS.API_PORT, () => {
            console.log(`[API] HTTP API listening on port ${CONSTANTS.API_PORT}`);
            resolve(app);
        });
    });
}

module.exports = startApiServer;
