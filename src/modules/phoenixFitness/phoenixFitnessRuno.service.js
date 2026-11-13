import { Op } from "sequelize";
import db from "../../database/index.js";
import { postOnce } from "../integrations/runo/runo.service.js";
import { formatPhoneForRuno } from "../integrations/runo/runo.mapper.js";

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const getPhoenixRunoConfig = (env = process.env) => {
  const enabled = String(env.RUNO_PHOENIX_ENABLED || "").trim().toLowerCase() === "true";
  const url = String(env.RUNO_PHOENIX_WEBSITE_FORM_API_URL || "").trim();
  let valid = false;
  try { valid = new URL(url).protocol === "https:"; } catch { /* fail closed */ }
  const configured = Number(env.RUNO_PHOENIX_TIMEOUT_MS);
  return { enabled, url, valid, timeoutMs: Number.isFinite(configured) && configured > 0 ? Math.min(configured, 30000) : 8000 };
};

export const mapPhoenixLeadToRunoPayload = (lead) => {
  const data = lead.website_data || {};
  const omitted = new Set(["name", "phone", "mobile", "email", "city", "state"]);
  const payload = {
    your_name: lead.name,
    your_phone: formatPhoneForRuno(lead.mobile_number),
    your_email: data.email || undefined,
    your_city: data.city || undefined,
    your_state: data.state || undefined,
    your_subject: `Phoenix Fitness ${lead.form_type}`,
    your_message: Object.entries(data).filter(([key, value]) => !omitted.has(key) && value !== "" && value != null).map(([key, value]) => `${key}: ${value}`).join("\n") || undefined,
    custom_source: "Website",
  };
  // Do not invent a Runo status or send unspecified custom CRM fields.
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
};

export const sendPhoenixLeadToRuno = async ({ lead, env = process.env, fetchImpl = globalThis.fetch, sleep = sleepDefault } = {}) => {
  const config = getPhoenixRunoConfig(env);
  if (!config.enabled) return { success: false, attempted: false, errorCode: "RUNO_DISABLED", retryable: true };
  if (!config.valid) return { success: false, attempted: false, errorCode: "RUNO_CONFIG_INVALID", retryable: true };
  const payload = mapPhoenixLeadToRunoPayload(lead);
  if (!payload.your_name || !/^[6-9]\d{9}$/.test(payload.your_phone || "")) return { success: false, attempted: false, errorCode: "RUNO_PAYLOAD_INVALID", retryable: false };
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    result = await postOnce({ url: config.url, payload, timeoutMs: config.timeoutMs, fetchImpl });
    if (result.ok) {
      // Runo may reject an otherwise HTTP-successful request at the application layer.
      if (result.body?.success === false || result.body?.error || result.body?.status === "error") return { success: false, attempted: true, attempts: attempt, errorCode: "RUNO_REJECTED", retryable: false };
      return { success: true, attempted: true, attempts: attempt, statusCode: result.statusCode };
    }
    if (!result.retryable || attempt === 3) return { success: false, attempted: true, attempts: attempt, errorCode: result.errorCode, retryable: result.retryable };
    await sleep(attempt === 1 ? 1000 : 3000);
  }
};

const dueWhere = (now) => ({
  source_provider: "phoenix_website", sheet_sync_status: "synced",
  runo_sync_status: { [Op.in]: ["pending", "failed", "processing"] },
  [Op.or]: [{ runo_sync_next_attempt_at: null }, { runo_sync_next_attempt_at: { [Op.lte]: now } }],
});
export const attemptPhoenixFitnessRunoSync = async (lead, options = {}) => {
  // A disabled integration leaves its durable pending rows available for later enablement.
  if (!getPhoenixRunoConfig(options.env).enabled) return false;
  if (lead.source_provider !== "phoenix_website" || lead.sheet_sync_status !== "synced") return false;
  const now = new Date();
  // Atomic lease prevents overlapping inline/worker calls from sending the same row.
  const [claimed] = await db.PhoenixFitness.update({ runo_sync_status: "processing", runo_sync_next_attempt_at: new Date(now.getTime() + 120000) }, {
    where: { ...dueWhere(now), id: lead.id, client_id: lead.client_id },
  });
  if (!claimed) return false;
  const attempts = Number(lead.runo_sync_attempts || 0) + 1;
  let result;
  try { result = await sendPhoenixLeadToRuno({ ...options, lead }); }
  catch { result = { success: false, errorCode: "RUNO_INTERNAL_ERROR", retryable: true }; }
  await lead.update({
    runo_sync_status: result.success ? "synced" : result.retryable ? "failed" : "rejected",
    runo_sync_attempts: attempts, runo_sync_last_error: result.success ? null : result.errorCode,
    runo_synced_at: result.success ? new Date() : null,
    runo_sync_next_attempt_at: result.success || !result.retryable ? null : new Date(Date.now() + Math.min(60000 * 2 ** Math.min(attempts - 1, 6), 3600000)),
  });
  if (!result.success) console.error("[Phoenix Runo] Delivery failed", { leadId: lead.id, errorCode: result.errorCode });
  return result.success;
};
export const retryPendingPhoenixFitnessRunoSyncs = async () => {
  if (!getPhoenixRunoConfig().enabled) return;
  const rows = await db.PhoenixFitness.findAll({ where: dueWhere(new Date()), limit: 50, order: [["created_at", "ASC"]] });
  for (const row of rows) await attemptPhoenixFitnessRunoSync(row);
};
