import { Op } from "sequelize";
import db from "../../database/index.js";
import {
  BIRTHWAVE_WEBSITE_SOURCE_KEYS,
  BIRTHWAVE_WEBSITE_LEAD_STATUSES,
} from "../../database/tables/BirthwaveWebsiteLeadTable/index.js";
import { attemptSheetSync } from "./birthwaveSheetSync.service.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const str = (v, max = 255) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export const normalizePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return digits ? `+${digits}` : "";
};

const serialize = (row) => ({
  id: row.id,
  source_key: row.source_key,
  external_lead_id: row.external_lead_id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  service: row.service,
  message: row.message,
  consent: Boolean(row.consent),
  source: row.source,
  campaign: row.campaign,
  creative: row.creative,
  channel: row.channel,
  landing_page: row.landing_page,
  referrer: row.referrer,
  ip_address: row.ip_address,
  utm_source: row.utm_source,
  utm_medium: row.utm_medium,
  utm_campaign: row.utm_campaign,
  utm_content: row.utm_content,
  utm_term: row.utm_term,
  gclid: row.gclid,
  fbclid: row.fbclid,
  status: row.status,
  notes: row.notes,
  birthwave_lead_id: row.birthwave_lead_id,
  sheet_sync_status: row.sheet_sync_status,
  sheet_sync_attempts: row.sheet_sync_attempts,
  sheet_sync_last_error: row.sheet_sync_last_error,
  sheet_synced_at: row.sheet_synced_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/**
 * Public intake from the Birthwave website / landing pages. The caller is
 * resolved to a client_id by resolvePublicTenantForModule("birthwave").
 */
export const createWebsiteLead = async (clientId, payload = {}) => {
  const sourceKey = String(payload.source_key || "").trim();
  if (!BIRTHWAVE_WEBSITE_SOURCE_KEYS.includes(sourceKey)) {
    throw httpError(400, `Unknown source_key. Expected one of: ${BIRTHWAVE_WEBSITE_SOURCE_KEYS.join(", ")}`);
  }

  const name = str(payload.name, 150);
  const phone = normalizePhone(payload.phone);
  if (!name) throw httpError(400, "Name is required");
  if (!phone || phone.replace(/\D/g, "").length < 7) throw httpError(400, "A valid phone number is required");

  const attribution =
    payload.attribution && typeof payload.attribution === "object" ? payload.attribution : payload;

  const row = await db.BirthwaveWebsiteLead.create({
    client_id: clientId,
    source_key: sourceKey,
    external_lead_id: str(payload.lead_id || payload.external_lead_id, 64),
    name,
    phone,
    email: str(payload.email, 200),
    service: str(payload.service, 160),
    message: str(payload.message, 5000),
    consent: payload.consent === false ? false : true,
    source: str(attribution.source, 120),
    campaign: str(attribution.campaign, 160),
    creative: str(attribution.creative, 160),
    channel: str(attribution.channel, 40) || "Form",
    landing_page: str(attribution.landing_page, 255),
    referrer: str(attribution.referrer, 500),
    ip_address: str(payload.ip_address, 64),
    utm_source: str(attribution.utm_source, 160),
    utm_medium: str(attribution.utm_medium, 160),
    utm_campaign: str(attribution.utm_campaign, 160),
    utm_content: str(attribution.utm_content, 160),
    utm_term: str(attribution.utm_term, 160),
    gclid: str(attribution.gclid, 255),
    fbclid: str(attribution.fbclid, 255),
    status: "New",
    sheet_sync_status: "pending",
  });

  // Best-effort inline mirror to Google Sheet; the cron worker retries the
  // rest (up to 3 attempts total).
  attemptSheetSync(row).catch(() => {});

  return { id: row.id, lead_id: row.external_lead_id || String(row.id) };
};

const buildWhere = (clientId, query = {}) => {
  const where = { client_id: clientId };
  if (query.source_key && BIRTHWAVE_WEBSITE_SOURCE_KEYS.includes(query.source_key)) {
    where.source_key = query.source_key;
  }
  if (query.status && BIRTHWAVE_WEBSITE_LEAD_STATUSES.includes(query.status)) {
    where.status = query.status;
  }
  if (query.sheet_sync_status) where.sheet_sync_status = query.sheet_sync_status;
  if (query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.search}%` } },
      { phone: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
      { service: { [Op.like]: `%${query.search}%` } },
      { campaign: { [Op.like]: `%${query.search}%` } },
    ];
  }
  return where;
};

export const listWebsiteLeads = async (clientId, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = (page - 1) * limit;

  const { rows, count } = await db.BirthwaveWebsiteLead.findAndCountAll({
    where: buildWhere(clientId, query),
    order: [
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
  });

  return {
    data: rows.map(serialize),
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    },
  };
};

export const getWebsiteLead = async (clientId, id) => {
  const row = await db.BirthwaveWebsiteLead.findOne({ where: { client_id: clientId, id } });
  if (!row) throw httpError(404, "Website lead not found");
  return serialize(row);
};

export const updateWebsiteLead = async (clientId, id, data = {}) => {
  const row = await db.BirthwaveWebsiteLead.findOne({ where: { client_id: clientId, id } });
  if (!row) throw httpError(404, "Website lead not found");

  const patch = {};
  if (data.status !== undefined) {
    if (!BIRTHWAVE_WEBSITE_LEAD_STATUSES.includes(data.status)) {
      throw httpError(400, `Invalid status. Allowed: ${BIRTHWAVE_WEBSITE_LEAD_STATUSES.join(", ")}`);
    }
    patch.status = data.status;
  }
  if (data.notes !== undefined) patch.notes = data.notes == null ? null : String(data.notes).slice(0, 5000);

  await row.update(patch);
  return serialize(row);
};

export const deleteWebsiteLead = async (clientId, id) => {
  const deleted = await db.BirthwaveWebsiteLead.destroy({ where: { client_id: clientId, id } });
  if (!deleted) throw httpError(404, "Website lead not found");
  return { id: Number(id) };
};

export const retryWebsiteLeadSheetSync = async (clientId, id) => {
  const row = await db.BirthwaveWebsiteLead.findOne({ where: { client_id: clientId, id } });
  if (!row) throw httpError(404, "Website lead not found");
  // Reset to "failed" so attemptSheetSync's claim can pick it up (a synced row
  // otherwise can't be re-sent).
  await row.update({
    sheet_sync_status: "failed",
    sheet_sync_attempts: 0,
    sheet_sync_next_attempt_at: null,
  });
  await attemptSheetSync(row);
  const fresh = await db.BirthwaveWebsiteLead.findByPk(row.id);
  return serialize(fresh);
};

/**
 * Re-queue every non-synced enquiry for this client (optionally one source).
 * Attempts are reset so the retry worker picks them up on its next tick, and
 * the first few are attempted inline for immediate feedback.
 */
export const retryFailedWebsiteLeadSheetSyncs = async (clientId, sourceKey) => {
  const where = { client_id: clientId, sheet_sync_status: { [Op.in]: ["pending", "failed", "syncing"] } };
  if (sourceKey && BIRTHWAVE_WEBSITE_SOURCE_KEYS.includes(sourceKey)) where.source_key = sourceKey;

  const rows = await db.BirthwaveWebsiteLead.findAll({ where, order: [["created_at", "ASC"]] });
  await db.BirthwaveWebsiteLead.update(
    { sheet_sync_status: "failed", sheet_sync_attempts: 0, sheet_sync_next_attempt_at: null },
    { where },
  );

  let synced = 0;
  for (const row of rows.slice(0, 25)) {
    row.sheet_sync_status = "failed";
    row.sheet_sync_attempts = 0;
    // eslint-disable-next-line no-await-in-loop
    if (await attemptSheetSync(row)) synced += 1;
  }

  return { requeued: rows.length, synced };
};

/**
 * Promote a website enquiry into a first-class CRM lead (birthwave_leads).
 * Idempotent: returns the existing link if already promoted.
 */
export const promoteWebsiteLead = async (clientId, id, actor) => {
  const row = await db.BirthwaveWebsiteLead.findOne({ where: { client_id: clientId, id } });
  if (!row) throw httpError(404, "Website lead not found");
  if (row.birthwave_lead_id) return { birthwave_lead_id: row.birthwave_lead_id, created: false };

  const lead = await db.BirthwaveLead.create({
    client_id: clientId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    service: row.service,
    source: "website",
    status: "new_lead",
    notes: row.message,
    source_provider: row.source_key,
    source_external_id: row.external_lead_id,
    custom_fields: {},
  });

  await row.update({ birthwave_lead_id: lead.id, status: row.status === "New" ? "Contacted" : row.status });

  await logBirthwaveActivity({
    clientId,
    leadId: lead.id,
    actor,
    eventType: "lead_created",
    title: "Lead created from website enquiry",
    description: `${row.source_key} · ${row.name}`,
  });

  return { birthwave_lead_id: lead.id, created: true };
};

export const getWebsiteLeadSourceCounts = async (clientId) => {
  const rows = await db.BirthwaveWebsiteLead.findAll({
    where: { client_id: clientId },
    attributes: [
      "source_key",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
      [
        db.sequelize.fn(
          "SUM",
          db.sequelize.literal("CASE WHEN status = 'New' THEN 1 ELSE 0 END"),
        ),
        "new_count",
      ],
    ],
    group: ["source_key"],
    raw: true,
  });

  const byKey = new Map(rows.map((r) => [r.source_key, r]));
  return BIRTHWAVE_WEBSITE_SOURCE_KEYS.map((key) => ({
    source_key: key,
    total: Number(byKey.get(key)?.count || 0),
    new: Number(byKey.get(key)?.new_count || 0),
  }));
};
