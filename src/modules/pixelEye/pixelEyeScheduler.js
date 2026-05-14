/**
 * Pixel Eye Scheduler
 *
 * Runs every minute (same cadence as the Google Apps Script 1-minute trigger)
 * and fires any notifications whose scheduled_at time has passed.
 */

import cron from "node-cron";
import { sendDueNotifications } from "./pixelEyeNotification.service.js";

let _isRunning = false;

export const startPixelEyeScheduler = () => {
  // '* * * * *' → every minute, matching the Google Script's everyMinutes(1) trigger.
  cron.schedule("* * * * *", async () => {
    // Guard against overlap if a run takes longer than 1 minute.
    if (_isRunning) return;

    _isRunning = true;
    try {
      await sendDueNotifications();
    } finally {
      _isRunning = false;
    }
  });

  console.log("Pixel Eye notification scheduler started (every 1 minute).");
};
