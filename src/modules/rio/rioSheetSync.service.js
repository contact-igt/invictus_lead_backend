import cron from "node-cron";
import { Op } from "sequelize";
import db from "../../database/index.js";

const SYNC_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const RETRY_BATCH_SIZE = 50;

// Deployed from scripts/google-apps-script/RioSheetCode.gs (in
// rio-frontend). One script, one spreadsheet, two tabs — routed by the
// `form_type` field sent below. An env override is still honored if set,
// but this is the deployment actually in use.
const DEFAULT_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbwLa0o9ubAYfm13oBiq2qNP8Ym4N4I0PJS9iwAIH3-r8XhpB9LwlgmpqsM7LLY8LTJhqw/exec";
const SHEET_URL = process.env.RIO_SHEET_WEBHOOK_URL || DEFAULT_SHEET_URL;

const value = (input) => (input === undefined || input === null ? "" : String(input));

// One entry per mirrored table: which Sequelize model, the `form_type`
// RioSheetCode.gs routes on, and how to turn a row into the flat
// key/value form the Apps Script's `e.parameter` expects.
const SYNC_TARGETS = {
  contact: {
    model: () => db.Rio,
    formType: "contact",
    buildFields: (record) => ({
      name: value(record.name),
      phone: value(record.mobile_number),
      branch: value(record.branch),
      service: value(record.service),
      message: value(record.message),
      ip_address: value(record.ip_address),
      utm_source: value(record.utm_source),
    }),
  },
  vaccine_chart: {
    model: () => db.RioVaccineChart,
    formType: "vaccine_chart",
    buildFields: (record) => ({
      registration_number: value(record.registration_number),
      parent_name: value(record.parent_name),
      child_name: value(record.child_name),
      phone: value(record.phone),
      dob: value(record.dob),
      gender: value(record.gender),
      ip_address: value(record.ip_address),
      utm_source: value(record.utm_source),
    }),
  },
};

const resolveTarget = (formType) => {
  const target = SYNC_TARGETS[formType];
  if (!target) throw new Error(`Unknown Rio sheet sync form_type: ${formType}`);
  return target;
};

export const sendSheetRecord = async (
  record,
  formType,
  { env = process.env, fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) => {
  const url = env.RIO_SHEET_WEBHOOK_URL || SHEET_URL;
  if (!url) throw new Error("Missing RIO_SHEET_WEBHOOK_URL configuration.");

  const target = resolveTarget(formType);
  const body = new URLSearchParams({
    form_type: target.formType,
    ...target.buildFields(record),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      body,
      redirect: "follow",
      signal: controller.signal,
    });

    const responseBody = (await response.text().catch(() => "")) || "";
    const snippet = responseBody.replace(/\s+/g, " ").trim().slice(0, 300);

    if (!response.ok) {
      throw new Error(`Google Sheets webhook responded ${response.status}. ${snippet}`);
    }

    // Apps Script returns HTTP 200 even for handled errors — inspect the body.
    try {
      const result = JSON.parse(responseBody);
      if (
        result?.result === "error" ||
        result?.success === false ||
        result?.ok === false ||
        result?.error
      ) {
        throw new Error(`Google Sheets webhook rejected the row. ${snippet}`);
      }
    } catch (error) {
      if (error.message?.startsWith("Google Sheets webhook rejected")) throw error;
      // A Google sign-in / access-denied HTML page means the Apps Script
      // deployment is not set to "Who has access: Anyone".
      if (/<title>\s*(Sign in|Error)\b/i.test(responseBody) || /accounts\.google\.com/i.test(responseBody)) {
        throw new Error(
          "Google Sheets webhook returned a sign-in page — set the Apps Script deployment access to \"Anyone\".",
        );
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

export const attemptSheetSync = async (record, formType, options) => {
  const target = resolveTarget(formType);
  const model = target.model();

  // Atomically claim the row so the inline call (on create) and the retry
  // worker can never sync the same lead twice.
  const [claimed] = await model.update(
    { sheet_sync_status: "syncing" },
    { where: { id: record.id, sheet_sync_status: { [Op.in]: ["pending", "failed"] } } },
  );
  if (!claimed) return false;

  const attempts = Number(record.sheet_sync_attempts || 0) + 1;

  try {
    await sendSheetRecord(record, formType, options);
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
      console.error(`[Rio Sheet Sync] Could not persist failure for ${formType} lead ${record.id}: ${updateError.message}`);
    }
    console.error(`[Rio Sheet Sync] ${formType} lead ${record.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
    return false;
  }
};

const retryPendingSheetSyncsFor = async (formType) => {
  const target = resolveTarget(formType);
  const model = target.model();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 3 * 60 * 1000);

  const rows = await model.findAll({
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
    await attemptSheetSync(row, formType);
  }
};

export const retryPendingSheetSyncs = async () => {
  await retryPendingSheetSyncsFor("contact");
  await retryPendingSheetSyncsFor("vaccine_chart");
};

let schedulerRunning = false;

export const startRioSheetSyncScheduler = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      if (schedulerRunning) return;
      schedulerRunning = true;
      try {
        await retryPendingSheetSyncs();
      } catch (error) {
        console.error(`[Rio Sheet Sync] Retry worker failed: ${error.message}`);
      } finally {
        schedulerRunning = false;
      }
    },
    { noOverlap: true },
  );
  console.log("Rio Google Sheets retry scheduler started (every 1 minute, max 3 attempts).");
};
