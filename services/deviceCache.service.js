const DeviceDao = require('../dao/device.dao');

class DeviceCacheService {
    constructor() {
        // In-memory set for fast O(1) lookups
        this.authorizedImeis = new Set();
        this.isLoaded = false;
    }

    /**
     * Load all devices from the database into the cache.
     */
    async loadFromDB() {
        try {
            console.log('[DEVICE_CACHE] Loading authorized devices from database...');
            const devices = await DeviceDao.getAllDevices();
            
            this.authorizedImeis.clear();
            for (const device of devices) {
                if (device.device_imei) {
                    this.authorizedImeis.add(device.device_imei.toString());
                }
            }
            this.isLoaded = true;
            console.log(`[DEVICE_CACHE] Successfully loaded ${this.authorizedImeis.size} devices into cache.`);
        } catch (error) {
            console.error('[DEVICE_CACHE] Error loading devices from database:', error.message);
            // Optionally throw the error if we absolutely cannot start without cache
        }
    }

    /**
     * Check if a device is authorized to connect.
     * @param {string} imei 
     * @returns {boolean}
     */
    isDeviceAuthorized(imei) {
        if (!imei) return false;
        
        // If DB loading failed or hasn't completed yet, we might want to gracefully reject or allow
        // Here we reject if it's not in the cache.
        if (!this.isLoaded) {
            console.warn('[DEVICE_CACHE] Cache not yet loaded. Rejecting connection for:', imei);
            return false;
        }

        return this.authorizedImeis.has(imei.toString());
    }

    /**
     * Add a device to the cache explicitly (e.g., when created via API).
     * @param {string} imei 
     */
    addDevice(imei) {
        if (imei) {
            this.authorizedImeis.add(imei.toString());
        }
    }

    /**
     * Update a device in the cache explicitly.
     * @param {string} oldImei 
     * @param {string} newImei 
     */
    updateDevice(oldImei, newImei) {
        if (oldImei && newImei && oldImei !== newImei) {
            this.authorizedImeis.delete(oldImei.toString());
            this.authorizedImeis.add(newImei.toString());
        }
    }

    /**
     * Remove a device from the cache (e.g., when deleted via API).
     * @param {string} imei 
     */
    removeDevice(imei) {
        if (imei) {
            this.authorizedImeis.delete(imei.toString());
        }
    }

    /**
     * Get all cached IMEIs.
     * @returns {Array<string>}
     */
    getAllCachedImeis() {
        return Array.from(this.authorizedImeis);
    }
}

// Export as a singleton
module.exports = new DeviceCacheService();
