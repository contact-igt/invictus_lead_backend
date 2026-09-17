import cron from "node-cron";
import { Op } from "sequelize";
import db from "../../database/index.js";

const SYNC_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const RETRY_BATCH_SIZE = 50;

// Deployed from scripts/google-apps-script/VlsSheetCode.gs (in
// vls-frontend). One script, one spreadsheet:
//   - "Website Enquires" for the /contact page (form_type=contact)
//   - one tab PER COURSE, named exactly after the course, auto-created on
//     first submission (form_type=course) — no code change needed when a
//     new course is added. An env override is still honored if set, but
//     this is the deployment actually in use.
const DEFAULT_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzVVIIbSADz1z5RnWVPU2SsZ510cnnQ-lz2TRv29fpejKSD5l0lvMjVeITEehFdt0VXbg/exec";
const SHEET_URL = process.env.VLS_SHEET_WEBHOOK_URL || DEFAULT_SHEET_URL;

const value = (input) => (input === undefined || input === null ? "" : String(input));

const SUBMISSION_TYPE_LABELS = {
  register_now: "Register Now",
  download_syllabus: "Download Syllabus",
};

const SYNC_TARGETS = {
  contact: {
    model: () => db.VlsContact,
    formType: "contact",
    buildFields: (record) => ({
      name: value(record.name),
      email: value(record.email),
      phone: value(record.mobile),
      message: value(record.message),
      ip_address: value(record.ip_address),
      utm_source: value(record.utm_source),
    }),
  },
  course: {
    model: () => db.VlsCourseDetails,
    formType: "course",
    buildFields: (record) => ({
      name: value(record.name),
      email: value(record.email),
      phone: value(record.mobile),
      course: value(record.course),
      submission_type: SUBMISSION_TYPE_LABELS[record.submission_type] || value(record.submission_type),
      call_time: value(record.call_time),
      class_mode: value(record.class_mode),
      ip_address: value(record.ip_address),
      utm_source: value(record.utm_source),
    }),
  },
};

const resolveTarget = (formType) => {
  const target = SYNC_TARGETS[formType];
  if (!target) throw new Error(`Unknown VLS sheet sync form_type: ${formType}`);
  return target;
};

export const sendSheetRecord = async (
  record,
  formType,
  { env = process.env, fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) => {
  const url = env.VLS_SHEET_WEBHOOK_URL || SHEET_URL;
  if (!url) throw new Error("Missing VLS_SHEET_WEBHOOK_URL configuration.");

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
      console.error(`[VLS Sheet Sync] Could not persist failure for ${formType} lead ${record.id}: ${updateError.message}`);
    }
    console.error(`[VLS Sheet Sync] ${formType} lead ${record.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
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
        { sheet_sync_status: "pending", createdAt: { [Op.lte]: staleBefore } },
        { sheet_sync_status: "syncing", updatedAt: { [Op.lte]: staleBefore } },
      ],
    },
    limit: RETRY_BATCH_SIZE,
    order: [["createdAt", "ASC"]],
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
  await retryPendingSheetSyncsFor("course");
};

let schedulerRunning = false;

export const startVlsSheetSyncScheduler = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      if (schedulerRunning) return;
      schedulerRunning = true;
      try {
        await retryPendingSheetSyncs();
      } catch (error) {
        console.error(`[VLS Sheet Sync] Retry worker failed: ${error.message}`);
      } finally {
        schedulerRunning = false;
      }
    },
    { noOverlap: true },
  );
  console.log("VLS Google Sheets retry scheduler started (every 1 minute, max 3 attempts).");
};
