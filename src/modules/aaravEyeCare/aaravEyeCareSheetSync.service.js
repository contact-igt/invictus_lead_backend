import cron from "node-cron";
import { Op } from "sequelize";
import db from "../../database/index.js";

const SYNC_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const RETRY_BATCH_SIZE = 50;

// Hardcoded Google Apps Script Webhook URL as configured for Aarav Eye Care
const AARAV_SHEET_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbzJ7il5zL8lp7XhIcmvSpVYGpVfqiH_J7R3IbGpdQdkmVeAGWwm7LigaasHmVDVGILr/exec";

const value = (input) =>
  input === undefined || input === null ? "" : String(input);

export const buildAaravSheetPayload = (record) => {
  const payload = {
    name: value(record.name),
    phone: value(record.mobile_number || record.phone),
    service: value(record.service),
    ip_address: value(record.ip_address),
    utm_source: value(record.utm_source || "Direct"),
    message: value(record.message),
  };

  if (record.source) {
    payload.source = value(record.source);
  }

  return payload;
};

export const sendAaravSheetRecord = async (
  record,
  { fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) => {
  const payload = buildAaravSheetPayload(record);
  const body = new URLSearchParams();

  Object.entries(payload).forEach(([key, val]) => {
    body.append(key, val);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(AARAV_SHEET_WEBHOOK_URL, {
      method: "POST",
      body,
      redirect: "follow",
      signal: controller.signal,
    });

    const responseBody = (await response.text().catch(() => "")) || "";
    const snippet = responseBody.replace(/\s+/g, " ").trim().slice(0, 300);

    if (!response.ok) {
      throw new Error(
        `Google Sheets webhook responded ${response.status}. ${snippet}`,
      );
    }

    try {
      const result = JSON.parse(responseBody);
      if (
        result?.result === "error" ||
        result?.success === false ||
        result?.ok === false ||
        result?.error
      ) {
        throw new Error(
          `Google Sheets webhook rejected the row. ${snippet}`,
        );
      }
    } catch (error) {
      if (error.message?.startsWith("Google Sheets webhook rejected")) {
        throw error;
      }
      if (
        /<title>\s*(Sign in|Error)\b/i.test(responseBody) ||
        /accounts\.google\.com/i.test(responseBody)
      ) {
        throw new Error(
          'Google Sheets webhook returned a sign-in page — set Apps Script access to "Anyone".',
        );
      }
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Google Sheets webhook timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const nextRetryAt = (attempts) => {
  const delayMs = attempts <= 1 ? 60_000 : 5 * 60_000;
  return new Date(Date.now() + delayMs);
};

export const attemptAaravSheetSync = async (record, options) => {
  const [claimed] = await db.AaravEyeCare.update(
    { sheet_sync_status: "syncing" },
    {
      where: {
        id: record.id,
        sheet_sync_status: { [Op.in]: ["pending", "failed"] },
      },
    },
  );

  if (!claimed) return false;

  const attempts = Number(record.sheet_sync_attempts || 0) + 1;

  try {
    await sendAaravSheetRecord(record, options);
    await record.update({
      sheet_sync_status: "synced",
      sheet_sync_attempts: attempts,
      sheet_sync_last_error: null,
      sheet_synced_at: new Date(),
      sheet_sync_next_attempt_at: null,
    });
    return true;
  } catch (error) {
    const message = value(
      error.message || "Google Sheets synchronization failed.",
    ).slice(0, 1000);
    const exhausted = attempts >= MAX_ATTEMPTS;

    try {
      await record.update({
        sheet_sync_status: "failed",
        sheet_sync_attempts: attempts,
        sheet_sync_last_error: message,
        sheet_synced_at: null,
        sheet_sync_next_attempt_at: exhausted ? null : nextRetryAt(attempts),
      });
    } catch (updateError) {
      console.error(
        `[Aarav Sheet Sync] Could not persist failure for lead ${record.id}: ${updateError.message}`,
      );
    }

    console.error(
      `[Aarav Sheet Sync] Lead ${record.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`,
    );
    return false;
  }
};

export const retryPendingAaravSheetSyncs = async () => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 3 * 60 * 1000);

  const rows = await db.AaravEyeCare.findAll({
    where: {
      sheet_sync_attempts: { [Op.lt]: MAX_ATTEMPTS },
      [Op.or]: [
        {
          sheet_sync_status: "failed",
          sheet_sync_next_attempt_at: { [Op.ne]: null, [Op.lte]: now },
        },
        {
          sheet_sync_status: "pending",
          created_at: { [Op.lte]: staleBefore },
        },
        {
          sheet_sync_status: "syncing",
          updated_at: { [Op.lte]: staleBefore },
        },
      ],
    },
    limit: RETRY_BATCH_SIZE,
    order: [["created_at", "ASC"]],
  });

  for (const row of rows) {
    if (["pending", "syncing"].includes(row.sheet_sync_status)) {
      await row.update({ sheet_sync_status: "failed" });
    }
    await attemptAaravSheetSync(row);
  }
};

let schedulerRunning = false;

export const startAaravEyeCareSheetSyncScheduler = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      if (schedulerRunning) return;
      schedulerRunning = true;
      try {
        await retryPendingAaravSheetSyncs();
      } catch (error) {
        console.error(
          `[Aarav Sheet Sync] Retry worker failed: ${error.message}`,
        );
      } finally {
        schedulerRunning = false;
      }
    },
    { noOverlap: true },
  );
  console.log(
    "Aarav Eye Care Google Sheets retry scheduler started (every 1 minute, max 3 attempts).",
  );
};
