import { Op } from "sequelize";
import db from "../../database/index.js";
import { parseAppDateTime } from "../../utils/dateTime.js";
import { CRM_PROVIDERS } from "../../database/tables/CrmIntegrationTable/index.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const clientId = (tenant) => {
  if (!tenant?.id) throw httpError(403, "A valid client context is required");
  return tenant.id;
};

const digitsOnly = (value) =>
  value ? String(value).replace(/\D/g, "").slice(-10) || null : null;

// ── Custom fields ──────────────────────────────────────────────────────────
const serializeField = (row) => ({
  id: row.id,
  client_id: row.client_id,
  entity_type: row.entity_type,
  field_key: row.field_key,
  label: row.label,
  field_type: row.field_type,
  options: row.options ?? null,
  required: Boolean(row.required),
  active: Boolean(row.active),
  show_in_form: Boolean(row.show_in_form),
  show_in_detail: Boolean(row.show_in_detail),
  show_in_table: Boolean(row.show_in_table),
  filterable: Boolean(row.filterable),
  display_order: row.display_order,
});

export const listFields = async (tenant, query = {}) => {
  const where = {
    client_id: clientId(tenant),
    entity_type: query.entity_type || "birthwave_lead",
  };
  if (!(query.include_archived === "true" || query.include_archived === true)) {
    where.active = true;
  }
  const rows = await db.CrmCustomField.findAll({
    where,
    order: [
      ["display_order", "ASC"],
      ["id", "ASC"],
    ],
  });
  return rows.map(serializeField);
};

const FIELD_WRITABLE = [
  "label",
  "field_type",
  "options",
  "required",
  "active",
  "show_in_form",
  "show_in_detail",
  "show_in_table",
  "filterable",
  "display_order",
];

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

export const createField = async (tenant, data) => {
  const cid = clientId(tenant);
  const entityType = data.entity_type || "birthwave_lead";
  const fieldKey = slugify(data.field_key || data.label);
  if (!fieldKey) throw httpError(400, "A valid field key or label is required");

  const existing = await db.CrmCustomField.findOne({
    where: { client_id: cid, entity_type: entityType, field_key: fieldKey },
  });
  if (existing) throw httpError(409, `Field "${fieldKey}" already exists`);

  const maxOrder = await db.CrmCustomField.max("display_order", {
    where: { client_id: cid, entity_type: entityType },
  });

  const row = await db.CrmCustomField.create({
    client_id: cid,
    entity_type: entityType,
    field_key: fieldKey,
    label: data.label.trim(),
    field_type: data.field_type,
    options: data.options ?? null,
    required: data.required ?? false,
    active: data.active ?? true,
    show_in_form: data.show_in_form ?? true,
    show_in_detail: data.show_in_detail ?? true,
    show_in_table: data.show_in_table ?? false,
    filterable: data.filterable ?? false,
    display_order:
      data.display_order ?? (Number.isFinite(maxOrder) ? maxOrder + 1 : 0),
  });
  return serializeField(row);
};

export const updateField = async (tenant, id, data) => {
  const row = await db.CrmCustomField.findOne({
    where: { client_id: clientId(tenant), id },
  });
  if (!row) throw httpError(404, "Field not found");

  const patch = {};
  for (const key of FIELD_WRITABLE) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  if (patch.label) patch.label = String(patch.label).trim();
  await row.update(patch);
  return serializeField(row);
};

export const archiveField = async (tenant, id) => {
  const row = await db.CrmCustomField.findOne({
    where: { client_id: clientId(tenant), id },
  });
  if (!row) throw httpError(404, "Field not found");
  await row.update({ active: false });
  return serializeField(row);
};

export const reorderFields = async (tenant, orderedIds = []) => {
  const cid = clientId(tenant);
  await Promise.all(
    orderedIds.map((id, index) =>
      db.CrmCustomField.update(
        { display_order: index },
        { where: { client_id: cid, id } },
      ),
    ),
  );
  return listFields(tenant, {});
};

// ── Calls ──────────────────────────────────────────────────────────────────
const serializeCall = (row) => ({
  id: row.id,
  client_id: row.client_id,
  lead_id: row.lead_id ?? null,
  provider: row.provider,
  external_call_id: row.external_call_id,
  phone_number: row.phone_number ?? null,
  normalized_phone_number: row.normalized_phone_number ?? null,
  direction: row.direction ?? null,
  status: row.status ?? null,
  started_at: row.started_at ?? null,
  ended_at: row.ended_at ?? null,
  duration_seconds: row.duration_seconds ?? null,
  agent_name: row.agent_name ?? null,
  recording_url: row.recording_url ?? null,
  outcome: row.outcome ?? null,
  lead: row.lead
    ? { id: row.lead.id, name: row.lead.name, phone: row.lead.phone }
    : null,
});

export const listCalls = async (tenant, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = (page - 1) * limit;

  const where = { client_id: clientId(tenant) };
  if (query.provider) where.provider = query.provider;
  if (query.direction) where.direction = query.direction;
  if (query.lead_id) where.lead_id = Number(query.lead_id);

  const { rows, count } = await db.CrmCall.findAndCountAll({
    where,
    include: [{ model: db.BirthwaveLead, as: "lead", required: false }],
    order: [
      ["started_at", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows.map(serializeCall),
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    },
  };
};

/**
 * Generic provider call ingestion. Matches a call to an existing lead by
 * normalized phone number, upserts on (client, provider, external_call_id),
 * and marks the corresponding integration "connected".
 */
export const ingestCall = async (tenant, provider, payload = {}) => {
  const cid = clientId(tenant);
  const normalized = digitsOnly(
    payload.phone_number || payload.phone || payload.customer_number,
  );

  const lead = normalized
    ? await db.BirthwaveLead.findOne({
        where: {
          client_id: cid,
          [Op.and]: [db.sequelize.where(db.sequelize.fn("RIGHT", db.sequelize.col("phone"), 10), normalized)],
        },
        attributes: ["id"],
        order: [["created_at", "DESC"]],
      })
    : null;

  const externalId =
    payload.external_call_id ||
    payload.call_id ||
    payload.id ||
    `${provider}-${Date.now()}`;

  const values = {
    client_id: cid,
    lead_id: lead?.id ?? null,
    provider,
    external_call_id: String(externalId),
    phone_number: payload.phone_number || payload.phone || null,
    normalized_phone_number: normalized,
    direction: payload.direction || null,
    status: payload.status || payload.call_status || null,
    started_at: payload.started_at ? parseAppDateTime(payload.started_at) : null,
    ended_at: payload.ended_at ? parseAppDateTime(payload.ended_at) : null,
    duration_seconds:
      payload.duration_seconds != null
        ? Number(payload.duration_seconds)
        : payload.duration != null
          ? Number(payload.duration)
          : null,
    agent_name: payload.agent_name || payload.agent || null,
    recording_url: payload.recording_url || payload.recording || null,
    outcome: payload.outcome || payload.disposition || null,
    raw_payload: payload,
  };

  const [row, created] = await db.CrmCall.findOrCreate({
    where: {
      client_id: cid,
      provider,
      external_call_id: values.external_call_id,
    },
    defaults: values,
  });
  if (!created) await row.update(values);

  await markIntegrationEvent(cid, provider === "manual" ? "runo" : provider);

  if (lead?.id) {
    await logBirthwaveActivity({
      clientId: cid,
      leadId: lead.id,
      eventType: "call_logged",
      title: `Call ${values.direction || ""} logged`.trim(),
      description: `${provider}${values.status ? ` · ${values.status}` : ""}`,
    });
  }

  return serializeCall(
    await db.CrmCall.findByPk(row.id, {
      include: [{ model: db.BirthwaveLead, as: "lead", required: false }],
    }),
  );
};

// ── Integrations ───────────────────────────────────────────────────────────
const serializeIntegration = (provider, row) => {
  const config = row?.config || {};
  return {
    provider,
    enabled: Boolean(row?.enabled),
    status: row?.status || "not_configured",
    last_error: row?.last_error || null,
    last_event_at: row?.last_event_at || null,
    config: {},
    config_keys_set: Object.keys(config).filter((key) => config[key] != null && config[key] !== ""),
  };
};

export const listIntegrations = async (tenant) => {
  const cid = clientId(tenant);
  const rows = await db.CrmIntegration.findAll({ where: { client_id: cid } });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return CRM_PROVIDERS.map((provider) =>
    serializeIntegration(provider, byProvider.get(provider)),
  );
};

export const updateIntegration = async (tenant, provider, data = {}) => {
  const cid = clientId(tenant);
  if (!CRM_PROVIDERS.includes(provider)) throw httpError(404, "Unknown provider");

  const [row] = await db.CrmIntegration.findOrCreate({
    where: { client_id: cid, provider },
    defaults: { client_id: cid, provider },
  });

  const patch = {};
  if (data.enabled !== undefined) patch.enabled = Boolean(data.enabled);
  if (data.config && typeof data.config === "object") {
    // Merge: blank/omitted values keep the previously stored secret.
    const merged = { ...(row.config || {}) };
    for (const [key, value] of Object.entries(data.config)) {
      if (value === "" || value == null) continue;
      merged[key] = value;
    }
    patch.config = merged;
  }

  const nextConfig = patch.config ?? row.config ?? {};
  const hasConfig = Object.keys(nextConfig).length > 0;
  const nextEnabled = patch.enabled ?? row.enabled;

  // Status stays "connected" only once a real event has been processed; before
  // that it is "not_configured" (no creds) or "connected"-pending via enable.
  if (row.status !== "connected") {
    patch.status = hasConfig && nextEnabled ? "connected" : "not_configured";
  }
  patch.last_error = null;

  await row.update(patch);
  return serializeIntegration(provider, row);
};

export const markIntegrationEvent = async (cid, provider, { error = null } = {}) => {
  if (!CRM_PROVIDERS.includes(provider)) return;
  const [row] = await db.CrmIntegration.findOrCreate({
    where: { client_id: cid, provider },
    defaults: { client_id: cid, provider, enabled: true },
  });
  await row.update({
    status: error ? "error" : "connected",
    last_error: error || null,
    last_event_at: new Date(),
  });
};

// ── Field mappings ─────────────────────────────────────────────────────────
const serializeMapping = (row) => ({
  id: row.id,
  provider: row.provider,
  external_field: row.external_field,
  target_type: row.target_type,
  target_field: row.target_field,
});

export const listMappings = async (tenant, provider) => {
  const rows = await db.CrmFieldMapping.findAll({
    where: { client_id: clientId(tenant), provider },
    order: [["id", "ASC"]],
  });
  return rows.map(serializeMapping);
};

export const saveMappings = async (tenant, provider, mappings = []) => {
  const cid = clientId(tenant);
  await db.sequelize.transaction(async (transaction) => {
    await db.CrmFieldMapping.destroy({
      where: { client_id: cid, provider },
      transaction,
    });
    if (mappings.length > 0) {
      await db.CrmFieldMapping.bulkCreate(
        mappings.map((m) => ({
          client_id: cid,
          provider,
          external_field: String(m.external_field).trim(),
          target_type: m.target_type === "custom" ? "custom" : "standard",
          target_field: String(m.target_field).trim(),
        })),
        { transaction },
      );
    }
  });
  return listMappings(tenant, provider);
};
