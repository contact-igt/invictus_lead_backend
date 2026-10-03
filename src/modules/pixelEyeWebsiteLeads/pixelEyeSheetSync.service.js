import cron from "node-cron";
import { Op } from "sequelize";
import db from "../../database/index.js";

const SYNC_TIMEOUT_MS = 20_000; // Apps Script cold starts can exceed 8s
const MAX_ATTEMPTS = 3;
const RETRY_BATCH_SIZE = 50;

// One Apps Script web app per landing page. Override any of them without a
// code change via PIXELEYE_SHEET_URL_<SOURCE_KEY_UPPER> (e.g. ..._CATARACT).
export const PIXELEYE_SHEET_URLS = {
  cataract: "https://script.google.com/macros/s/AKfycbyaLH4ji2HO61zwJN5bcsbJ718ieP59iQSF4lIgWMzXt1NN8FfOUbZa0wV3OC2HUIZTNA/exec",
  lasik: "https://script.google.com/macros/s/AKfycbxAih9TQkWeoUXVHHSER0pnK1KTTQwN_Vtu9-W6ymozuLr3iVaFovrhkxTgRE5ocbBV/exec",
  keratoconus: "https://script.google.com/macros/s/AKfycbzk-Lf3u6xgxD5gWCDkIx3iKn1KJwmyjnCmfvntKFuoV5Hjt0z6HfjCw_7Zl2D6qMsxNw/exec",
  squint: "https://script.google.com/macros/s/AKfycbzo84M-LIdwxgEysnVG3DkaVdXvTwKoaCxn9GnNg5bxTVD4xdjpcys6BiBhnV0tUDB_OQ/exec",
  sanathnagar: "https://script.google.com/macros/s/AKfycbwJQmovbB3jo2d7mEHKf-8bFzfJqoI8f__bKFFJtMm_CCzT9fWIRsVfCYPGdUXBj63Y/exec",
  retina: "https://script.google.com/macros/s/AKfycbzlZPDSg4w0IYDrFXOh8eeGqWPig8sjGX3-QDuZE_9y3nCDjgcmQlYUc26jIT-gYeYmAQ/exec",
  pediatric: "https://script.google.com/macros/s/AKfycbzG-ZMTUI44rNY7i80bvBVcA6UFPdi95c-2HKZ4ZmI2NJWyWZpKsYV9V9HqlMBjyhF1/exec",
  registration: "https://script.google.com/macros/s/AKfycbyObRdzmjF0wayc4zAbzWIoLoVqRk2aApLhfPQHxkB0OCbPENMFpHVMTgeyHgXsjAwK/exec",
  glaucoma: "https://script.google.com/macros/s/AKfycbz-B1DQKeKMamq7LdnAKm6ttGnXHJ0wBXnW6uuix89a5GSErdXFDw7ZXGlzUdlYXvTA/exec",
};

export const PIXELEYE_SOURCE_KEYS = Object.keys(PIXELEYE_SHEET_URLS);

// Single-service landing pages are also recognisable from `service`, so a
// page that does not send source_key yet still lands in the right sheet.
const SERVICE_TO_SOURCE_KEY = {
  cataract: "cataract",
  lasik: "lasik",
  keratoconus: "keratoconus",
  squint: "squint",
  retina: "retina",
  pediatric: "pediatric",
  glaucoma: "glaucoma",
};

export const resolveSourceKey = ({ source_key: sourceKey, service } = {}) => {
  const explicit = String(sourceKey || "").trim().toLowerCase();
  if (PIXELEYE_SOURCE_KEYS.includes(explicit)) return explicit;
  return SERVICE_TO_SOURCE_KEY[String(service || "").trim().toLowerCase()] || null;
};

export const resolveSheetUrl = (sourceKey, env = process.env) =>
  env[`PIXELEYE_SHEET_URL_${String(sourceKey || "").toUpperCase()}`] || PIXELEYE_SHEET_URLS[sourceKey] || null;

const value = (input) => (input === undefined || input === null ? "" : String(input));

// Superset of the field names the existing landing-page scripts read
// (PatientName/MobileNumber and Name/Mobile) so any of them can consume it.
export const buildSheetFields = (record) => ({
  PatientName: value(record.name),
  Name: value(record.name),
  MobileNumber: value(record.mobile_number),
  Mobile: value(record.mobile_number),
  Service: value(record.service),
  IP_Address: value(record.ip_address),
  utm_source: value(record.utm_source),
  source_key: value(record.source_key),
});

export const sendSheetRecord = async (
  record,
  { env = process.env, fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) => {
  const url = resolveSheetUrl(record.source_key, env);
  if (!url) throw new Error(`No Google Sheet configured for source "${record.source_key}".`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      body: new URLSearchParams(buildSheetFields(record)),
      redirect: "follow",
      signal: controller.signal,
    });

    const responseBody = (await response.text().catch(() => "")) || "";
    const snippet = responseBody.replace(/\s+/g, " ").trim().slice(0, 300);

    if (!response.ok) throw new Error(`Google Sheets webhook responded ${response.status}. ${snippet}`);

    if (/<title>\s*(Sign in|Error)\b/i.test(responseBody) || /accounts\.google\.com/i.test(responseBody)) {
      throw new Error('Google Sheets webhook returned a sign-in page — set the Apps Script deployment access to "Anyone".');
    }

    // Apps Script returns 200 even for handled errors — inspect JSON bodies.
    try {
      const result = JSON.parse(responseBody);
      if (result?.result === "error" || result?.success === false || result?.ok === false || result?.error) {
        throw new Error(`Google Sheets webhook rejected the row. ${snippet}`);
      }
    } catch (error) {
      if (error.message?.startsWith("Google Sheets webhook rejected")) throw error;
      // Plain-text / empty 200 body: treated as success.
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Google Sheets webhook timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

// 1 min, 5 min, then give up (attempts capped at MAX_ATTEMPTS).
const nextRetryAt = (attempts) => new Date(Date.now() + (attempts <= 1 ? 60_000 : 5 * 60_000));

export const attemptSheetSync = async (record, options) => {
  // Leads saved without a landing page (e.g. by an older backend version
  // during a rollout, whose pages already wrote to their own sheet) have no
  // sheet to mirror to. Close them out instead of retrying and failing.
  if (!record.source_key) {
    await db.PixelEyeWebsiteLead.update(
      { sheet_sync_status: "skipped" },
      { where: { id: record.id, sheet_sync_status: { [Op.in]: ["pending", "failed"] } } },
    );
    return false;
  }

  // Atomically claim the row so the inline call and the retry worker can
  // never mirror the same lead twice.
  const [claimed] = await db.PixelEyeWebsiteLead.update(
    { sheet_sync_status: "syncing" },
    { where: { id: record.id, sheet_sync_status: { [Op.in]: ["pending", "failed"] } } },
  );
  if (!claimed) return false;

  const attempts = Number(record.sheet_sync_attempts || 0) + 1;

  try {
    await sendSheetRecord(record, options);
    await record.update({
      sheet_sync_status: "synced",
      sheet_sync_attempts: attempts,
      sheet_sync_last_error: null,
      sheet_synced_at: new Date(),
      sheet_sync_next_attempt_at: null,
    });
    return true;
  } catch (error) {
    const message = value(error.message || "Google Sheets synchronization failed.").slice(0, 1000);
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
      console.error(`[PixelEye Sheet Sync] Could not persist failure for lead ${record.id}: ${updateError.message}`);
    }
    console.error(`[PixelEye Sheet Sync] lead ${record.id} (${record.source_key}) failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
    return false;
  }
};

export const retryPendingSheetSyncs = async () => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 3 * 60 * 1000);

  const rows = await db.PixelEyeWebsiteLead.findAll({
    where: {
      sheet_sync_attempts: { [Op.lt]: MAX_ATTEMPTS },
      [Op.or]: [
        { sheet_sync_status: "failed", sheet_sync_next_attempt_at: { [Op.ne]: null, [Op.lte]: now } },
        { sheet_sync_status: "pending", created_at: { [Op.lte]: staleBefore } },
        { sheet_sync_status: "syncing", updated_at: { [Op.lte]: staleBefore } },
      ],
    },
    limit: RETRY_BATCH_SIZE,
    order: [["created_at", "ASC"]],
  });

  for (const row of rows) {
    if (["pending", "syncing"].includes(row.sheet_sync_status)) {
      await row.update({ sheet_sync_status: "failed" });
    }
    await attemptSheetSync(row);
  }
};

let schedulerRunning = false;

export const startPixelEyeSheetSyncScheduler = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      if (schedulerRunning) return;
      schedulerRunning = true;
      try {
        await retryPendingSheetSyncs();
      } catch (error) {
        console.error(`[PixelEye Sheet Sync] Retry worker failed: ${error.message}`);
      } finally {
        schedulerRunning = false;
      }
    },
    { noOverlap: true },
  );
  console.log("PixelEye website-lead Google Sheets retry scheduler started (every 1 minute, max 3 attempts).");
};
