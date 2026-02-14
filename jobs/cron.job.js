const cron = require("node-cron");
const { CONSTANTS } = require("../constants");
const IOTService = require("../services/iot.service");

class CronJobScheduler {
  constructor() {}

  static revertTimedOutIOTCommandsCronjob = () => {
    // Schedule based on timeout, e.g. every timeout interval. 
    // Cron syntax: "*/N * * * * *" (every N seconds) if N < 60
    // If timeout is 60s, run every minute "* * * * *"
    
    let cronExpression = "* * * * *"; // Default every minute
    
    if (CONSTANTS.IOT_COMMAND_TIMEOUT < 60) {
        cronExpression = `*/${CONSTANTS.IOT_COMMAND_TIMEOUT} * * * * *`;
    }

    console.log(`[CRON] Scheduling revertTimedOutIOTCommandsCronjob with expression: ${cronExpression}`);

    cron.schedule(
      cronExpression,
      IOTService.revertTimeoutCommands
    );
  };
}

module.exports = CronJobScheduler;
