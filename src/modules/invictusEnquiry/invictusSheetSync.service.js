import cron from "node-cron";
import { Op } from "sequelize";
import db from "../../database/index.js";

const SYNC_TIMEOUT_MS = 8_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const RETRY_BATCH_SIZE = 50;
const DEFAULT_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbxEccKBZ_qCJeCfYeDNuVpTrE94yyLEHAdBuS6AZwRaGhgMNGVWe35y-09U3_hl_kJ27w/exec";
const TELECALLING_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbz7vYFkLog3qAL_6GY2IKj5wx-K5cX_vYFWfCkQUau6m5Q_NPKuU7EI8ipe73SpTceq/exec";

const value = (input) => (input === undefined || input === null ? "" : String(input));
const list = (input) => (Array.isArray(input) ? input.join(", ") : value(input));

export const selectSheetWebhookUrl = (kind, record, env = process.env) => {
  if (kind === "career" && record.role_slug === "telecalling-executive") {
    return TELECALLING_WEBHOOK_URL;
  }
  return DEFAULT_WEBHOOK_URL;
};

export const buildSheetPayload = (kind, record) => {
  if (kind === "general") {
    return {
      sheet: "Sheet1",
      sheet_name: "Sheet1",
      submission_id: value(record.id),
      submitted_at: value(record.submitted_at || record.createdAt),
      name: value(record.name),
      mobile: value(record.mobile),
      email: value(record.email),
      industry: value(record.industry),
      applied_for: value(record.applied_for || "General Inquiry"),
      appliedFor: value(record.applied_for || "General Inquiry"),
      ip_address: value(record.ip_address),
      status: value(record.status || "New"),
    };
  }

  return {
    sheet: "Careers",
    sheet_name: "Careers",
    submission_id: value(record.application_reference),
    submitted_at: value(record.createdAt),
    application_reference: value(record.application_reference),
    role: value(record.role),
    applied_for: value(record.role),
    appliedFor: value(record.role),
    name: value(record.full_name),
    full_name: value(record.full_name),
    phone: value(record.phone),
    mobile: value(record.phone),
    email: value(record.email),
    city: value(record.current_city),
    current_city: value(record.current_city),
    notice_period: value(record.notice_period),
    experience: value(record.experience),
    portfolio_or_showreel: value(record.portfolio_or_showreel),
    resume_or_linkedin: value(record.resume_or_linkedin),
    tools: list(record.tools),
    categories: list(record.work_categories),
    work_categories: list(record.work_categories),
    workflow_answer: value(record.workflow_answer),
    ai_usage: value(record.ai_usage),
    judgement_answer: value(record.judgement_answer),
    practical_assessment: value(record.practical_assessment),
    screening_flags: list(record.screening_flags),
    status: value(record.status || "New"),
  };
};

export const sendSheetRecord = async (
  kind,
  record,
  { env = process.env, fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) => {
  const url = selectSheetWebhookUrl(kind, record, env);
  if (!url) throw new Error(`Missing Google Sheets webhook configuration for ${kind}.`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(buildSheetPayload(kind, record)).toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google Sheets webhook responded with status ${response.status}.`);
    }

    const responseBody = await response.text();
    if (responseBody) {
      try {
        const result = JSON.parse(responseBody);
        if (
          result?.success === false ||
          result?.error ||
          ["error", "failed", "failure", "unauthorized"].includes(value(result?.status).toLowerCase())
        ) {
          throw new Error("Google Sheets webhook rejected the row.");
        }
      } catch (error) {
        if (error.message === "Google Sheets webhook rejected the row.") throw error;
        if (/^\s*(error|failed|failure|unauthorized)\b/i.test(responseBody)) {
          throw new Error("Google Sheets webhook rejected the row.");
        }
        // Existing Apps Script deployments may return plain text on success.
      }
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Google Sheets webhook timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const nextRetryAt = (attempts) =>
  new Date(Date.now() + Math.min(60_000 * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS));

export const attemptSheetSync = async (kind, record, options) => {
  const attempts = Number(record.sheet_sync_attempts || 0) + 1;

  try {
    await sendSheetRecord(kind, record, options);
    try {
      await record.update({
        sheet_sync_status: "synced",
        sheet_sync_attempts: attempts,
        sheet_sync_last_error: null,
        sheet_synced_at: new Date(),
        sheet_sync_next_attempt_at: null,
      });
      return true;
    } catch (error) {
      console.error(`[Invictus Sheet Sync] Could not mark ${kind} record ${record.id} as synced: ${error.message}`);
      return false;
    }
  } catch (error) {
    const message = value(error.message || "Google Sheets synchronization failed.").slice(0, 1000);
    try {
      await record.update({
        sheet_sync_status: "failed",
        sheet_sync_attempts: attempts,
        sheet_sync_last_error: message,
        sheet_synced_at: null,
        sheet_sync_next_attempt_at: nextRetryAt(attempts),
      });
    } catch (updateError) {
      console.error(`[Invictus Sheet Sync] Could not persist failure state for ${kind} record ${record.id}: ${updateError.message}`);
    }
    console.error(`[Invictus Sheet Sync] ${kind} record ${record.id} failed (attempt ${attempts}): ${message}`);
    return false;
  }
};

export const retryPendingSheetSyncs = async () => {
  const where = {
    sheet_sync_status: { [Op.in]: ["pending", "failed"] },
    [Op.or]: [
      { sheet_sync_next_attempt_at: null },
      { sheet_sync_next_attempt_at: { [Op.lte]: new Date() } },
    ],
  };

  const [generalRows, careerRows] = await Promise.all([
    db.InvictusGeneralEnquiry.findAll({ where, limit: RETRY_BATCH_SIZE, order: [["createdAt", "ASC"]] }),
    db.InvictusCareersApplication.findAll({ where, limit: RETRY_BATCH_SIZE, order: [["createdAt", "ASC"]] }),
  ]);

  for (const row of generalRows) await attemptSheetSync("general", row);
  for (const row of careerRows) await attemptSheetSync("career", row);
};

let schedulerRunning = false;

export const startInvictusSheetSyncScheduler = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      if (schedulerRunning) return;
      schedulerRunning = true;
      try {
        await retryPendingSheetSyncs();
      } catch (error) {
        console.error(`[Invictus Sheet Sync] Retry worker failed: ${error.message}`);
      } finally {
        schedulerRunning = false;
      }
    },
    { noOverlap: true },
  );
  console.log("Invictus Google Sheets retry scheduler started (every 1 minute).");
};
