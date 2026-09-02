import cron from "node-cron";
import { Op } from "sequelize";
import db from "../../database/index.js";

const SYNC_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const RETRY_BATCH_SIZE = 50;

// All Birthwave sites currently mirror into one Apps Script sheet. Per-source
// overrides can be supplied via env (BIRTHWAVE_SHEET_URL_<SOURCE_KEY_UPPER>)
// without any code change.
const DEFAULT_SHEET_URL =
  process.env.BIRTHWAVE_SHEET_WEBHOOK_URL ||
  "https://script.google.com/macros/s/AKfycbxtksI07s7EEDCSY-XwWVJLgZA3S2sTiBZzf-SqL_oumJA4EcNJK6rVHR-_nvJo4UXj/exec";

const value = (input) => (input === undefined || input === null ? "" : String(input));

export const resolveSheetWebhookUrl = (sourceKey, env = process.env) => {
  const override = env[`BIRTHWAVE_SHEET_URL_${String(sourceKey || "").toUpperCase()}`];
  return override || DEFAULT_SHEET_URL;
};

// Matches the `NormalizedLead` JSON body the Birthwave landing pages have
// always POSTed to the Apps Script, so the existing deployment needs no change.
export const buildSheetPayload = (record) => ({
  lead_id: value(record.external_lead_id || record.id),
  submission_id: value(record.external_lead_id || record.id),
  created_at: value(record.created_at || record.createdAt),
  submitted_at: value(record.created_at || record.createdAt),
  source_key: value(record.source_key),

  name: value(record.name),
  phone: value(record.phone),
  mobile: value(record.phone),
  email: value(record.email),
  service: value(record.service),
  message: value(record.message),

  source: value(record.source),
  campaign: value(record.campaign),
  creative: value(record.creative),
  channel: value(record.channel || "Form"),

  landing_page: value(record.landing_page),
  referrer: value(record.referrer),
  ipaddress: value(record.ip_address),
  ip_address: value(record.ip_address),

  utm_source: value(record.utm_source),
  utm_medium: value(record.utm_medium),
  utm_campaign: value(record.utm_campaign),
  utm_content: value(record.utm_content),
  utm_term: value(record.utm_term),
  gclid: value(record.gclid),
  fbclid: value(record.fbclid),

  lead_status: "new",
  follow_up_status: "pending",
  next_action: "contact lead",
  consent: record.consent === false ? false : true,
  status: value(record.status || "New"),
});

export const sendSheetRecord = async (
  record,
  { env = process.env, fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) => {
  const url = resolveSheetWebhookUrl(record.source_key, env);
  if (!url) throw new Error("Missing Google Sheets webhook configuration.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSheetPayload(record)),
      redirect: "follow",
      signal: controller.signal,
    });

    const body = (await response.text().catch(() => "")) || "";
    const snippet = body.replace(/\s+/g, " ").trim().slice(0, 300);

    if (!response.ok) {
      throw new Error(`Google Sheets webhook responded ${response.status}. ${snippet}`);
    }

    // Apps Script returns HTTP 200 even for handled errors — inspect the body.
    try {
      const result = JSON.parse(body);
      if (
        result?.success === false ||
        result?.ok === false ||
        result?.error ||
        ["error", "failed", "failure", "unauthorized"].includes(
          value(result?.status || result?.result).toLowerCase(),
        )
      ) {
        throw new Error(`Google Sheets webhook rejected the row. ${snippet}`);
      }
    } catch (error) {
      if (error.message?.startsWith("Google Sheets webhook rejected")) throw error;
      // A Google sign-in / access-denied HTML page means the Apps Script
      // deployment is not set to "Who has access: Anyone".
      if (/<title>\s*(Sign in|Error)\b/i.test(body) || /accounts\.google\.com/i.test(body)) {
        throw new Error(
          "Google Sheets webhook returned a sign-in page — set the Apps Script deployment access to \"Anyone\".",
        );
      }
      if (/^\s*(error|failed|failure|unauthorized|exception)\b/i.test(body)) {
        throw new Error(`Google Sheets webhook rejected the row. ${snippet}`);
      }
      // Otherwise: plain-text or empty 200 body — treat as success.
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Google Sheets webhook timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

// 1 min, 5 min, then give up (attempts capped at MAX_ATTEMPTS).
const nextRetryAt = (attempts) => {
  const delayMs = attempts <= 1 ? 60_000 : 5 * 60_000;
  return new Date(Date.now() + delayMs);
};

export const attemptSheetSync = async (record, options) => {
  // Atomically claim the row so the inline call (on create) and the retry
  // worker can never sync the same enquiry twice.
  const [claimed] = await db.BirthwaveWebsiteLead.update(
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
      console.error(
        `[Birthwave Sheet Sync] Could not persist failure for website lead ${record.id}: ${updateError.message}`,
      );
    }
    console.error(
      `[Birthwave Sheet Sync] website lead ${record.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`,
    );
    return false;
  }
};

export const retryPendingSheetSyncs = async () => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 3 * 60 * 1000);

  const rows = await db.BirthwaveWebsiteLead.findAll({
    where: {
      sheet_sync_attempts: { [Op.lt]: MAX_ATTEMPTS },
      [Op.or]: [
        // A genuine prior failure that scheduled a retry.
        {
          sheet_sync_status: "failed",
          sheet_sync_next_attempt_at: { [Op.ne]: null, [Op.lte]: now },
        },
        // A row whose inline sync (on create) never completed — server
        // restart mid-request, etc. Fresh `pending` rows are left to that
        // inline attempt so the worker can't double-send.
        { sheet_sync_status: "pending", created_at: { [Op.lte]: staleBefore } },
        // A row stuck mid-sync (process died between claim and result).
        { sheet_sync_status: "syncing", updated_at: { [Op.lte]: staleBefore } },
      ],
    },
    limit: RETRY_BATCH_SIZE,
    order: [["created_at", "ASC"]],
  });

  for (const row of rows) {
    // "syncing"/stale rows must be reset so attemptSheetSync's claim succeeds.
    if (["pending", "syncing"].includes(row.sheet_sync_status)) {
      await row.update({ sheet_sync_status: "failed" });
    }
    await attemptSheetSync(row);
  }
};

let schedulerRunning = false;

export const startBirthwaveSheetSyncScheduler = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      if (schedulerRunning) return;
      schedulerRunning = true;
      try {
        await retryPendingSheetSyncs();
      } catch (error) {
        console.error(`[Birthwave Sheet Sync] Retry worker failed: ${error.message}`);
      } finally {
        schedulerRunning = false;
      }
    },
    { noOverlap: true },
  );
  console.log("Birthwave Google Sheets retry scheduler started (every 1 minute, max 3 attempts).");
};
