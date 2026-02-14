// Verification script for unified notification architecture
// Mocks db, deviceManager, and moment to test the flow

const mockDb = {
    query: async (q, params) => {
        const qs = q.trim();
        console.log('[MOCK DB] Query:', qs.substring(0, 80) + '...');

        if (qs.includes('FROM tbl_iot_command_logs t1') && qs.includes('LEFT JOIN tbl_booking_logs t2') && qs.includes('estimated_timeout_at')) {
            // revertTimeoutCommands query
            return {
                rows: [
                    { 
                        imei: 'RETRY_1', command: 'setdigout 1?', 
                        estimated_timeout_at: new Date(Date.now() - 10000), 
                        retry: 0, booking_action: 'INITIATE_START', booking_log_id: 100
                    },
                    { 
                        imei: 'RETRY_2', command: 'setdigout 0?', 
                        estimated_timeout_at: new Date(Date.now() - 10000), 
                        retry: 1, booking_action: 'INITIATE_PAUSE', booking_log_id: 101
                    },
                    { 
                        imei: 'FAIL_1', command: 'setdigout 1?', 
                        estimated_timeout_at: new Date(Date.now() - 10000), 
                        retry: 3, booking_action: 'INITIATE_START', booking_log_id: 102
                    },
                    { 
                        imei: 'FAIL_2', command: 'setdigout 0?', 
                        estimated_timeout_at: new Date(Date.now() - 10000), 
                        retry: 4, booking_action: 'INITIATE_END', booking_log_id: 103
                    }
                ]
            };
        }
        if (qs.includes('FROM tbl_iot_command_logs t1') && qs.includes('LEFT JOIN tbl_booking_logs t2') && qs.includes('WHERE t1.imei')) {
            // confirmCommandExecution JOIN query
            return {
                rows: [{
                    imei: 'TEST_IMEI', command: 'setdigout 1?',
                    booking_action: 'INITIATE_START', booking_log_id: 200, booking_id: 50
                }]
            };
        }
        if (qs.includes('SELECT * FROM tbl_iot_command_logs WHERE imei')) {
            // confirmCommandExecution initial query
            return {
                rows: [{
                    imei: 'TEST_IMEI', command: 'setdigout 1?',
                    booking_log_id: 200
                }]
            };
        }
        // UPDATE / DELETE — just acknowledge
        return { rows: [], rowCount: 0 };
    }
};

const mockDeviceManager = {
    sendCommand: (imei, command) => {
        console.log(`[MOCK DEVICE] sendCommand(${imei}, ${command})`);
        return true;
    },
    getSocket: (imei) => ({ write: () => {} })
};

const mockMoment = () => ({
    add: () => ({ toDate: () => new Date(Date.now() + 60000) })
});

// Inject mocks
require.cache[require.resolve('./db')] = { exports: mockDb };
require.cache[require.resolve('./services/deviceManagement.service')] = { exports: mockDeviceManager };
require.cache[require.resolve('moment')] = { exports: mockMoment };

const IOTService = require('./services/iot.service');

async function verify() {
    console.log('\n=== TEST 1: revertTimeoutCommands ===');
    console.log('Expected: 2 retries + notifyBulkCommandRetry, 2 failures + notifyBulkCommandFailure\n');
    await IOTService.revertTimeoutCommands();

    console.log('\n=== TEST 2: confirmCommandExecution ===');
    console.log('Expected: notifyCommandSuccess with identified=true\n');
    await IOTService.confirmCommandExecution({ imei: 'TEST_IMEI', command: 'DOUT1:1' });

    console.log('\n=== ALL TESTS COMPLETE ===');
}

verify().catch(console.error);
