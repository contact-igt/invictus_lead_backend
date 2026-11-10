import cron from "node-cron";
import { Op } from "sequelize";
import db from "../../database/index.js";

const SYNC_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const RETRY_BATCH_SIZE = 50;

// All Birthwave sites currently mirror into one Apps Script sheet. Per-source
// overrides can be supplied via env (BIRTHWAVE_SHEET_URL_<SOURCE_KEY_UPPER>)
// without any code change.
const DEFAULT_SHEET_URL =
  process.env.BIRTHWAVE_SHEET_WEBHOOK_URL ||
  "https://script.google.com/macros/s/AKfycbx7H4xQ0serxp62mxUXZ-kWmJ3FRqWsF0qjEMShe2t61f5HaHddh9pUvHu8tBJoCYuEgQ/exec";
const VAGINISMUS_SHEET_URL =
  process.env.BIRTHWAVE_SHEET_URL_BIRTHWAVE_VAGINISMUS ||
  "https://script.google.com/macros/s/AKfycbwzfF1_XyxxkS8Ow30PYNKNeYeA2HZgUc-k8LV8JrAZi2ouTtulLRqb6PKTEGO7XrZaCA/exec";
const WORKSHOP_SHEET_URL =
  process.env.BIRTHWAVE_SHEET_URL_BIRTHWAVE_WORKSHOP ||
  "https://script.google.com/macros/s/AKfycbwJSPavPeWqpyoVNdLEYY6kmLyKRJwRTYJodVrOF7z8Y-LDdnQ2t4B-t1AFaPTv4e3l/exec";

const value = (input) => (input === undefined || input === null ? "" : String(input));

const SHEET_SERVICE_CODES = {
  "General Contact": "general-contact",
  "Fertility & Preconception": "fertility-preconception",
  "Vaginismus & Intimate Wellness": "vaginismus",
  "Vaginismus & Intimate Health": "vaginismus",
  "Pregnancy & Antenatal Care": "pregnancy-antenatal-care",
  "Normal Birth & Delivery Care": "normal-birth-delivery",
  "VBAC (Vaginal Birth After Caesarean)": "vbac",
  "Birth Preparation & Childbirth Education": "birth-preparation",
  "All-in-One Prenatal Workshop": "birth-preparation",
  "Childbirth Preparation Workshop": "birth-preparation",
  "Natural Birth": "natural-birth",
  "Postpartum Recovery & Care": "postpartum-care",
  "Lactation & Breastfeeding Support": "lactation",
  "Newborn & Pediatric Care": "newborn-pediatric-care",
  "Gynaecology & Women's Wellness": "gynaecology",
  "Nutrition & Emotional Well-being": "nutrition-emotional-wellbeing",
};

const resolveSheetServiceCode = (record) => SHEET_SERVICE_CODES[value(record.service).trim()] || "unclassified";

// A Date rendered with String()/toString() picks up whatever timezone the
// Node process happens to run in (IST locally, UTC on some hosts, etc.),
// producing an inconsistent, unparseable string per row in the Sheet. Always
// render Birthwave timestamps in IST explicitly, matching the Rio/VLS sheets.
const formatIstTimestamp = (input) => {
  if (input === undefined || input === null || input === "") return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return value(input);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(",", "");
};

export const resolveSheetWebhookUrl = (sourceKey, env = process.env) => {
  if (sourceKey === "birthwave_vaginismus") return VAGINISMUS_SHEET_URL;
  if (sourceKey === "birthwave_workshop") return WORKSHOP_SHEET_URL;
  const override = env[`BIRTHWAVE_SHEET_URL_${String(sourceKey || "").toUpperCase()}`];
  return override || DEFAULT_SHEET_URL;
};

// Matches the `NormalizedLead` JSON body the Birthwave landing pages have
// always POSTed to the Apps Script, so the existing deployment needs no change.
export const buildSheetPayload = (record, env = process.env) => {
  const istTime = formatIstTimestamp(record.created_at || record.createdAt);
  const leadName = value(record.name);
  const leadPhone = value(record.phone);
  const leadEmail = value(record.email);
  const leadService = value(record.service);
  const leadMessage = value(record.message);
  const leadConsent = record.consent === false ? false : true;

  // Extract structured workshop & payment details from message block
  const stageMatch = leadMessage.match(/Pregnancy stage:\s*([^\n]+)/i);
  const paymentStatusMatch = leadMessage.match(/Payment status:\s*([^\n]+)/i);
  const amountMatch = leadMessage.match(/Advance amount paid:\s*₹?([0-9]+)/i);
  const rzpPaymentIdMatch = leadMessage.match(/Razorpay Payment ID:\s*([^\n]+)/i);
  const rzpOrderIdMatch = leadMessage.match(/Razorpay Order ID:\s*([^\n]+)/i);
  const sessionMatch = leadMessage.match(/Workshop session:\s*([^\n]+)/i);

  const stage = stageMatch ? stageMatch[1].trim() : "";
  const paymentStatus = paymentStatusMatch ? paymentStatusMatch[1].trim() : "";
  const amount = amountMatch ? amountMatch[1].trim() : "";
  const rzpPaymentId = rzpPaymentIdMatch ? rzpPaymentIdMatch[1].trim() : "";
  const rzpOrderId = rzpOrderIdMatch ? rzpOrderIdMatch[1].trim() : "";
  const programmDate = sessionMatch ? sessionMatch[1].trim() : "";

  return {
    secret: value(env.BIRTHWAVE_SHEET_WEBHOOK_SECRET),
    serviceCode: resolveSheetServiceCode(record),
    lead_id: value(record.external_lead_id || record.id),
    submission_id: value(record.external_lead_id || record.id),
    created_at: istTime,
    submitted_at: istTime,
    source_key: value(record.source_key),

    // Exact Google Sheet headers (Timestamp, Name, Phone, Email, Amount, Balance, Status, IDs, Date, Service, etc.)
    "Timestamp": istTime,
    "Name": leadName,
    "Phone": leadPhone,
    "What do you need help with?": leadService,
    "Email": leadEmail,
    "Message": leadMessage,
    "Source": value(record.source) || (record.source_key === "birthwave_workshop" ? "Childbirth Workshop Landing Page" : record.source_key === "birthwave_vaginismus" ? "Vaginismus Landing Page" : "Website Inquiries"),
    "UTM Source": value(record.utm_source),
    "UTM Medium": value(record.utm_medium),
    "UTM Campaign": value(record.utm_campaign),
    "GCLID": value(record.gclid),
    "FBCLID": value(record.fbclid),
    "Consultation Focus": leadService,
    "Consent": leadConsent ? "Yes" : "No",
    "Service": leadService,
    "Amount Paid": amount ? `₹${amount}` : "",
    "Balance at Venue": amount ? "₹3,000" : "",
    "Payment Status": paymentStatus ? paymentStatus.toUpperCase() : "",
    "Transaction ID": rzpPaymentId,
    "Razorpay Order ID": rzpOrderId,
    "Workshop Date": programmDate,
    "Pregnancy Stage": stage,

    // Property keys for lowercase/snake_case scripts
    timestamp: istTime,
    name: leadName,
    phone: leadPhone,
    mobile: leadPhone,
    email: leadEmail,
    service: leadService,
    help_option: leadService,
    helpOption: leadService,
    consultation_focus: leadService,
    consultationFocus: leadService,
    message: leadMessage,
    consent: leadConsent,

    stage,
    pregnancy_stage: stage,
    payment_status: paymentStatus,
    amount,
    balance: amount ? 3000 : 0,
    razorpay_payment_id: rzpPaymentId,
    transaction_id: rzpPaymentId,
    razorpay_order_id: rzpOrderId,
    order_id: rzpOrderId,
    programm_date: programmDate,
    workshop_date: programmDate,

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
    status: value(record.status || "New"),
  };
};

export const sendSheetRecord = async (
  record,
  { env = process.env, fetchImpl = fetch, timeoutMs = SYNC_TIMEOUT_MS } = {},
) => {
  const url = resolveSheetWebhookUrl(record.source_key, env);
  if (!url) throw new Error("Missing Google Sheets webhook configuration.");
  if (record.source_key !== "birthwave_vaginismus" && !value(env.BIRTHWAVE_SHEET_WEBHOOK_SECRET).trim()) {
    throw new Error("Missing BIRTHWAVE_SHEET_WEBHOOK_SECRET.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSheetPayload(record, env)),
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
