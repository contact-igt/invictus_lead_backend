import cron from "node-cron";
import { attemptPhoenixFitnessRunoSync, retryPendingPhoenixFitnessRunoSyncs } from "./phoenixFitnessRuno.service.js";
import { Op } from "sequelize";
import db from "../../database/index.js";

export const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycby1WuPwU5mCSNcDMFmPBjttJuJlnNrCof0iPsq2u8DtRZVG9RKjB5wuMpjLJmyf4Qql/exec";
export const WEBSITE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzM2H9rwMS-mGswPnwicaG9eU0zc2juvfQK9uqiWdReldx5RpNaG7AGBCRZlokR9lyw/exec";
const TIMEOUT_MS = 8_000;
const BATCH_SIZE = 50;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const value = (input) => (input == null ? "" : String(input));

// These names match the Apps Script's e.parameter fields exactly.
export const buildPhoenixFitnessSheetPayload = (lead) => ({
  name: value(lead.name), phone: value(lead.mobile_number).replace(/\D/g, ""), branch: value(lead.branch),
  ip_address: value(lead.ip_address), utm_source: value(lead.utm_source),
});

export const sendPhoenixFitnessSheetRecord = async (lead, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) => {
  const websiteLead = lead.source_provider === "phoenix_website";
  const url = websiteLead ? WEBSITE_SHEET_URL : WEBHOOK_URL;
  if (!url) throw new Error("Website Google Sheets URL is not configured.");
  const payload = websiteLead ? {
    ...lead.website_data, name: lead.name, phone: lead.mobile_number, mobile: lead.mobile_number,
    formType: lead.form_type, submittedAt: new Date(lead.created_at).toISOString(),
    timestamp: new Date(lead.created_at).toISOString(), leadId: lead.id, requestId: lead.website_request_id,
  } : buildPhoenixFitnessSheetPayload(lead);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST", headers: { "Content-Type": websiteLead ? "application/json" : "application/x-www-form-urlencoded" },
      body: websiteLead ? JSON.stringify(payload) : new URLSearchParams(payload).toString(), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Google Sheets webhook responded with status ${response.status}.`);
    const body = await response.text();
    if (websiteLead) {
      let result;
      try { result = JSON.parse(body); } catch { throw new Error("Website Sheets webhook returned invalid JSON."); }
      if (result?.success === false || (result?.success !== true && result?.result !== "success" && result?.status !== "success")) throw new Error("Google Sheets webhook rejected the row.");
    } else if (body) {
      try {
        const result = JSON.parse(body);
        if (result?.result !== "success" && result?.success !== true) throw new Error("Google Sheets webhook rejected the row.");
      } catch (error) {
        if (error.message === "Google Sheets webhook rejected the row.") throw error;
      }
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Google Sheets webhook timed out.");
    throw error;
  } finally { clearTimeout(timeout); }
};

const nextRetryAt = (attempts) => new Date(Date.now() + Math.min(60_000 * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS));
export const attemptPhoenixFitnessSheetSync = async (lead, options) => {
  if (lead.source_provider === "phoenix_website") {
    const [claimed] = await db.PhoenixFitness.update({ sheet_sync_status: "syncing", sheet_sync_next_attempt_at: new Date(Date.now() + 120000) }, {
      where: { id: lead.id, client_id: lead.client_id,
        sheet_sync_status: { [Op.in]: ["pending", "failed", "syncing"] },
        [Op.or]: [{ sheet_sync_next_attempt_at: null }, { sheet_sync_next_attempt_at: { [Op.lte]: new Date() } }],
      },
    });
    if (!claimed) return false;
  }
  const attempts = Number(lead.sheet_sync_attempts || 0) + 1;
  try {
    await sendPhoenixFitnessSheetRecord(lead, options);
    await lead.update({ sheet_sync_status: "synced", sheet_sync_attempts: attempts, sheet_sync_last_error: null, sheet_synced_at: new Date(), sheet_sync_next_attempt_at: null });
    if (lead.source_provider === "phoenix_website") {
      await attemptPhoenixFitnessRunoSync(lead).catch(() => console.error("[Phoenix Runo] Delivery deferred", { leadId: lead.id }));
    }
    return true;
  } catch (error) {
    const message = value(error.message || "Google Sheets synchronization failed.").slice(0, 1000);
    await lead.update({ sheet_sync_status: "failed", sheet_sync_attempts: attempts, sheet_sync_last_error: message, sheet_synced_at: null, sheet_sync_next_attempt_at: nextRetryAt(attempts) });
    console.error(`[Phoenix Fitness Sheet Sync] Lead ${lead.id} failed: ${message}`);
    return false;
  }
};
export const retryPendingPhoenixFitnessSheetSyncs = async () => {
  const rows = await db.PhoenixFitness.findAll({ where: { sheet_sync_status: { [Op.in]: ["pending", "failed", "syncing"] }, [Op.or]: [{ sheet_sync_next_attempt_at: null }, { sheet_sync_next_attempt_at: { [Op.lte]: new Date() } }] }, limit: BATCH_SIZE, order: [["created_at", "ASC"]] });
  for (const row of rows) await attemptPhoenixFitnessSheetSync(row);
};
export const startPhoenixFitnessSheetSyncScheduler = () => {
  cron.schedule("* * * * *", async () => { await retryPendingPhoenixFitnessSheetSyncs().catch((error) => console.error(`[Phoenix Fitness Sheet Sync] Retry worker failed: ${error.message}`)); await retryPendingPhoenixFitnessRunoSyncs().catch(() => console.error("[Phoenix Runo] Retry worker failed")); }, { noOverlap: true });
  console.log("Phoenix Fitness Google Sheets retry scheduler started (every 1 minute).");
};
