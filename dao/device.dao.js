const db = require('../db');

class DeviceDao {
    /**
     * Get all devices from the database.
     * @returns {Promise<Array>} Array of device objects.
     */
    static async getAllDevices() {
        const query = `
            SELECT device_id, device_imei, device_status, created_at, updated_at
            FROM tbl_devices
            ORDER BY created_at DESC;
        `;
        const res = await db.query(query);
        return res.rows;
    }

    /**
     * Get a single device by ID.
     * @param {number|string} id 
     * @returns {Promise<Object|null>} Device object or null.
     */
    static async getDeviceById(id) {
        const query = `
            SELECT device_id, device_imei, device_status, created_at, updated_at
            FROM tbl_devices
            WHERE device_id = $1;
        `;
        const res = await db.query(query, [id]);
        return res.rows[0] || null;
    }

    /**
     * Get a single device by IMEI.
     * @param {string} imei 
     * @returns {Promise<Object|null>} Device object or null.
     */
    static async getDeviceByImei(imei) {
        const query = `
            SELECT device_id, device_imei, device_status, created_at, updated_at
            FROM tbl_devices
            WHERE device_imei = $1;
        `;
        const res = await db.query(query, [imei]);
        return res.rows[0] || null;
    }

    /**
     * Add a new device.
     * @param {string} imei 
     * @returns {Promise<Object>} The inserted device object.
     */
    static async addDevice(imei) {
        const query = `
            INSERT INTO tbl_devices (device_imei, device_status, created_at, updated_at)
            VALUES ($1, 'offline', NOW(), NOW())
            RETURNING device_id, device_imei, device_status, created_at, updated_at;
        `;
        const res = await db.query(query, [imei]);
        return res.rows[0];
    }

    /**
     * Update an existing device.
     * @param {number|string} id 
     * @param {string} imei 
     * @returns {Promise<Object|null>} The updated device object.
     */
    static async updateDevice(id, imei) {
        const query = `
            UPDATE tbl_devices
            SET device_imei = $1, updated_at = NOW()
            WHERE device_id = $2
            RETURNING device_id, device_imei, device_status, created_at, updated_at;
        `;
        const res = await db.query(query, [imei, id]);
        return res.rows[0] || null;
    }

    /**
     * Delete a device.
     * @param {number|string} id 
     * @returns {Promise<boolean>} True if deleted, false if not found.
     */
    static async deleteDevice(id) {
        const query = `
            DELETE FROM tbl_devices
            WHERE device_id = $1;
        `;
        const res = await db.query(query, [id]);
        return res.rowCount > 0;
    }

    /**
     * Update device status (online/offline).
     * @param {string} imei 
     * @param {string} status 'online' or 'offline'
     */
    static async updateStatus(imei, status) {
        const query = `
            UPDATE tbl_devices
            SET device_status = $1, updated_at = NOW()
            WHERE device_imei = $2;
        `;
        await db.query(query, [status, imei]);
    }
}

module.exports = DeviceDao;
