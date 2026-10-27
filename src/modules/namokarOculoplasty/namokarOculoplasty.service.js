import db from "../../database/index.js";

// Requested to remain in code because this is the browser-fallback destination too.
const SHEET_URL = "https://script.google.com/macros/s/AKfycbztz8idqpumD5yEdF_9sfGKNfJh-Lr6ex0S82N-JfksEsFJOWwBAQ17OdvMdzpS6-h4_g/exec";
const PULSEOS_URL = "https://pulseosapi-production-a7a9.up.railway.app/forms/website/328e8ec9-eff6-476f-ad2f-b3dd6a988739";
const clean = (value, max = 500) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const phone = (value) => { const digits = String(value || "").replace(/\D/g, ""); return digits.length === 10 ? `+91${digits}` : digits.length === 12 && digits.startsWith("91") ? `+${digits}` : ""; };
const fail = (status, message) => Object.assign(new Error(message), { status });

export async function syncToPulseOS(row) {
  const token = process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN;
  if (!token) return row.update({ pulseos_status: "pending" });
  const attempts = row.pulseos_attempts + 1;
  try {
    const response = await fetch(PULSEOS_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-PulseOS-Intake-Token": token }, body: JSON.stringify({ submissionId: row.submission_id, formId: row.form_name, name: row.name, phone: row.phone, service: row.service, message: row.message, pageUrl: row.page_url, language: "en" }), signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false || body?.success === false || body?.error) throw new Error(`PulseOS delivery failed${response.ok ? "" : ` (${response.status})`}`);
    await row.update({ pulseos_status: "synced", pulseos_attempts: attempts, pulseos_error: null, pulseos_synced_at: new Date() });
  } catch (error) {
    await row.update({ pulseos_status: "failed", pulseos_attempts: attempts, pulseos_error: String(error.message || "delivery_failed").slice(0, 255), pulseos_synced_at: null });
  }
}

export async function syncToSheet(row) {
  const attempts = row.sheet_sync_attempts + 1;
  try {
    const response = await fetch(SHEET_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ form: "Namokar Oculoplasty Lead", lead_id: row.id, submission_id: row.submission_id, data: row.toJSON() }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Sheet returned ${response.status}`);
    await row.update({ sheet_sync_status: "synced", sheet_sync_attempts: attempts, sheet_sync_error: null, sheet_synced_at: new Date() });
  } catch (error) {
    await row.update({ sheet_sync_status: "failed", sheet_sync_attempts: attempts, sheet_sync_error: String(error.message || "delivery_failed").slice(0, 255) });
  }
}

const deliver = async (row) => {
  await syncToPulseOS(row);
  await syncToSheet(row);
};

export async function createOculoplastyLead(clientId, input = {}) {
  const name = clean(input.name, 120); const normalizedPhone = phone(input.phone); const service = clean(input.service, 120) || "Oculoplasty consultation";
  const submissionId = clean(input.submission_id, 100);
  if (!submissionId || !name || !normalizedPhone) throw fail(422, "Name, phone and submission_id are required");
  const [row, created] = await db.NamokarOculoplastyLead.findOrCreate({ where: { client_id: clientId, submission_id: submissionId }, defaults: { name, phone: normalizedPhone, doctor: clean(input.doctor, 120), service, message: clean(input.message, 2000), form_name: clean(input.form_name, 100) || "oculoplasty_appointment", page_name: clean(input.page_name, 100) || "namokar_oculoplasty_landing", source: clean(input.source, 80) || "website", page_url: clean(input.page_url), referrer: clean(input.referrer), utm_source: clean(input.utm_source, 150), utm_medium: clean(input.utm_medium, 150), utm_campaign: clean(input.utm_campaign, 150), utm_term: clean(input.utm_term, 150), utm_content: clean(input.utm_content, 150), form_payload_json: input } });
  if (created) deliver(row).catch(() => {});
  return { row, created };
}

export async function listOculoplastyLeads(clientId, query = {}) {
  const page = Math.max(Number(query.page) || 1, 1); const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100); const where = { client_id: clientId };
  ["lead_status", "source", "service", "sheet_sync_status"].forEach((key) => { if (clean(query[key], 120)) where[key] = clean(query[key], 120); });
  if (clean(query.search, 120)) { const value = `%${clean(query.search, 120)}%`; where[db.Sequelize.Op.or] = ["name", "phone", "service"].map((field) => ({ [field]: { [db.Sequelize.Op.like]: value } })); }
  return db.NamokarOculoplastyLead.findAndCountAll({ where, order: [["created_at", "DESC"]], limit, offset: (page - 1) * limit });
}

export async function updateOculoplastyLead(clientId, id, input = {}) {
  const row = await db.NamokarOculoplastyLead.findOne({ where: { id, client_id: clientId } }); if (!row) throw fail(404, "Lead not found");
  await row.update({ ...(clean(input.lead_status, 30) ? { lead_status: clean(input.lead_status, 30) } : {}), ...(typeof input.notes === "string" ? { notes: input.notes.trim().slice(0, 5000) || null } : {}) }); return row;
}

export async function retryOculoplastySheetSync(clientId, id) { const row = await db.NamokarOculoplastyLead.findOne({ where: { id, client_id: clientId } }); if (!row) throw fail(404, "Lead not found"); await deliver(row); return row.reload(); }
