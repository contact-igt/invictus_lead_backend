/**
 * Pixel Eye Follow-up Compliance Scheduler
 *
 * Runs every 15 minutes and marks overdue follow-up compliance rows as
 * called, missed, or ignored based on call-log and lead-state checks.
 */

import cron from "node-cron";
import { processDuePendingComplianceBatch } from "./pixelEyeFollowUpCallCompliance.service.js";

let _isRunning = false;

export const startPixelEyeFollowUpComplianceScheduler = () => {
  cron.schedule(
    "*/15 * * * *",
    async () => {
      if (_isRunning) {
        console.warn(
          "[PixelEye Compliance Scheduler] Tick skipped because previous run is still active.",
        );
        return;
      }

      const startedAt = Date.now();
      _isRunning = true;

      try {
        console.log(
          `[PixelEye Compliance Scheduler] Tick started at ${new Date(startedAt).toISOString()}`,
        );

        const summary = await processDuePendingComplianceBatch({ limit: 50 });

        console.log(
          `[PixelEye Compliance Scheduler] Tick completed in ${Date.now() - startedAt}ms ` +
            `processed=${summary.processed} called=${summary.called} missed=${summary.missed} ignored=${summary.ignored}`,
        );
      } catch (err) {
        console.error(
          `[PixelEye Compliance Scheduler] Tick failed: ${err?.message || err}`,
        );
      } finally {
        _isRunning = false;
      }
    },
    { noOverlap: true },
  );

  console.log("Pixel Eye follow-up compliance scheduler started (every 15 minutes).");
};
