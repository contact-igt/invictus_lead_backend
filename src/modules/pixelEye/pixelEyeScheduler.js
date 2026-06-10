/**
 * Pixel Eye Scheduler
 *
 * Runs every minute (same cadence as the Google Apps Script 1-minute trigger)
 * and fires any notifications whose scheduled_at time has passed.
 */

import cron from "node-cron";
import { sendDueNotifications } from "./pixelEyeNotification.service.js";

let _isRunning = false;
let _lagMonitorStarted = false;

const EVENT_LOOP_LAG_CHECK_MS = 10_000;
const EVENT_LOOP_LAG_WARN_MS = 5_000;
const EVENT_LOOP_LAG_WARN_THROTTLE_MS = 60_000;

const startEventLoopLagMonitor = () => {
  if (_lagMonitorStarted) return;

  _lagMonitorStarted = true;
  let expectedAt = Date.now() + EVENT_LOOP_LAG_CHECK_MS;
  let lastWarningAt = 0;

  const timer = setInterval(() => {
    const now = Date.now();
    const lagMs = now - expectedAt;
    expectedAt = now + EVENT_LOOP_LAG_CHECK_MS;

    if (
      lagMs > EVENT_LOOP_LAG_WARN_MS &&
      now - lastWarningAt > EVENT_LOOP_LAG_WARN_THROTTLE_MS
    ) {
      lastWarningAt = now;
      console.warn(
        `[PixelEye Scheduler] Event loop lag detected: ${lagMs}ms. ` +
          "Cron may miss executions if the process is paused, sleeping, or CPU-blocked.",
      );
    }
  }, EVENT_LOOP_LAG_CHECK_MS);

  timer.unref?.();
};

export const startPixelEyeScheduler = () => {
  startEventLoopLagMonitor();

  cron.schedule("* * * * *", async () => {
    if (_isRunning) {
      console.warn("[PixelEye Scheduler] Tick skipped because previous run is still active.");
      return;
    }

    const startedAt = Date.now();
    _isRunning = true;

    try {
      console.log(`[PixelEye Scheduler] Tick started at ${new Date(startedAt).toISOString()}`);
      await sendDueNotifications();
    } finally {
      console.log(
        `[PixelEye Scheduler] Tick completed in ${Date.now() - startedAt}ms`,
      );
      _isRunning = false;
    }
  }, { noOverlap: true });

  console.log("Pixel Eye notification scheduler started (every 1 minute).");
};
