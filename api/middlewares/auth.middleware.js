const { CONSTANTS } = require("../../constants");

const authMiddleware = {}

authMiddleware.checkApiKey = (req, res, next) => {
    const apiKey = req.header('x-api-key');
    if (!apiKey || apiKey !== CONSTANTS.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

module.exports = {authMiddleware};
