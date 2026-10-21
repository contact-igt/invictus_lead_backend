import db from "../../database/index.js";

export const PULSEOS_URL = "https://pulseosapi-production-a7a9.up.railway.app/forms/website/328e8ec9-eff6-476f-ad2f-b3dd6a988739";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwVxZMai0hUESuSAwV06N1AKKKaPP_pzKsCf6t1dp8qoLMeM9-24PUPAPlUhxNIbrec/exec";
const post = async (url, body, headers = {}) => { try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }); if (!r.ok) return false; const j = await r.json().catch(() => null); return j?.ok !== false && j?.success !== false && !j?.error; } catch { return false; } };
const phone = (value) => { const d = String(value || "").replace(/\D/g, ""); return d.length === 10 ? `+91${d}` : d.length === 12 && d.startsWith("91") ? `+${d}` : ""; };

export async function deliver(row) {
  const token = process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN;
  const pulseok = token && await post(PULSEOS_URL, { submissionId: row.submission_id, formId: row.form_id, name: row.name, phone: row.phone, service: row.service, message: row.message, pageUrl: row.page_url, language: "en" }, { "X-PulseOS-Intake-Token": token });
  await row.update({ pulseos_status: pulseok ? "synced" : token ? "failed" : "pending", pulseos_attempts: row.pulseos_attempts + (token ? 1 : 0), pulseos_error: pulseok || !token ? null : "delivery_failed", pulseos_synced_at: pulseok ? new Date() : null });
  const sheetok = await post(SHEETS_URL, { form: "Namokar Website Lead", data: row.toJSON() });
  await row.update({ sheet_sync_status: sheetok ? "synced" : "failed", sheet_sync_attempts: row.sheet_sync_attempts + 1, sheet_sync_error: sheetok ? null : "delivery_failed", sheet_synced_at: sheetok ? new Date() : null });
}

export async function createNamokarLead(clientId, input) {
  const normalized = phone(input.phone); if (!input.submissionId || !input.name || !normalized || !input.service || input.consent !== true) { const e = new Error("invalid_request"); e.status = 422; throw e; }
  const [row, created] = await db.NamokarWebsiteLead.findOrCreate({ where: { client_id: clientId, submission_id: String(input.submissionId).slice(0,100) }, defaults: { form_id: String(input.formId).slice(0,100), name: String(input.name).trim().slice(0,120), phone: normalized, service: String(input.service).trim().slice(0,120), message: input.message ? String(input.message).trim().slice(0,1000) : null, referral_code: input.referralCode ? String(input.referralCode).trim().slice(0,40) : null, consent: true, page_url: input.pageUrl ? String(input.pageUrl).slice(0,500) : null } });
  if (created) deliver(row).catch(() => {}); return { row, created };
}
export const listNamokarLeads = (clientId) => db.NamokarWebsiteLead.findAll({ where: { client_id: clientId }, order: [["created_at", "DESC"]], limit: 200 });

export async function retryNamokarLeadDelivery(clientId, id) {
  const row = await db.NamokarWebsiteLead.findOne({ where: { id, client_id: clientId } });
  if (!row) { const e = new Error("not_found"); e.status = 404; throw e; }
  await deliver(row);
  return row.reload();
}
