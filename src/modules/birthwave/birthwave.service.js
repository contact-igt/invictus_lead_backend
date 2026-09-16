import { Op, fn, col, literal } from "sequelize";
import db from "../../database/index.js";
import {
  getInclusiveDateRange,
  getTodayBounds,
  parseAppDateTime,
} from "../../utils/dateTime.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";
import {
  BIRTHWAVE_LEAD_STATUSES,
  BIRTHWAVE_LEAD_SOURCES,
  LEGACY_STATUS_TO_STAGE,
} from "../../database/tables/BirthwaveLeadTable/index.js";
import { resolveOrCreateBirthwaveContact, serializeBirthwaveContact } from "./birthwaveContact.service.js";
import { leadVisibilityWhere, assertCanViewLead, assertCanEditLead, isTenantAdmin } from "./birthwavePermissions.service.js";
import { applyAppointmentStatusContinuationInTransaction, createAppointmentContinuationInTransaction } from "./birthwaveAppointmentContinuation.service.js";
import { getOperationalDashboard } from "./birthwaveDashboard.service.js";
import { resolveServiceForIntake } from "./birthwaveService.service.js";

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const clientScope = (tenant, extra = {}) => {
  const clientId = tenant?.id;
  if (!clientId) throw httpError(403, "A valid client context is required");
  return { client_id: clientId, ...extra };
};

const trimOrNull = (value) =>
  typeof value === "string" ? value.trim() || null : value ?? null;

// BW-FIX-002: birthwave_leads.status is persisted using the full BIRTHWAVE_LEAD_STAGES
// vocabulary, not the older 6-value legacy set — LOST/INVALID/CONTACTING/QUALIFIED/
// INTERESTED have no legacy equivalent, so down-converting on write is lossy. This
// accepts either legacy or stage input (the create/update Joi schema already allows
// both) and always stores the canonical stage form. See
// BIRTHWAVE_PRODUCTION_FIX_LEDGER.md, BW-FIX-002.
const normalizeStoredLeadStatus = (value) => LEGACY_STATUS_TO_STAGE[value] || value || "NEW";
const stageForStatus = (value) => LEGACY_STATUS_TO_STAGE[value] || value || "NEW";
const ACTIVE_OPERATIONAL_STAGES = new Set(["ASSIGNED", "CONTACTING", "CONTACTED", "QUALIFIED", "INTERESTED", "APPOINTMENT_SCHEDULED", "ATTENDED"]);

// ── Serializers ────────────────────────────────────────────────────────────
const serializeDoctor = (row) => ({
  id: row.id,
  name: row.name,
  specialty: row.specialty ?? null,
  avatar_url: row.avatar_url ?? null,
  active: Boolean(row.active),
});

const serializeLead = (row) => {
  const doctor = row.assignedDoctor;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    contact_id: row.contact_id ?? null,
    contact: row.contact ? serializeBirthwaveContact(row.contact) : null,
    // BW-SVC-001: `service` is the display name, resolved from the service
    // master when linked so a rename shows through immediately, and falling back
    // to the legacy text for Leads whose value never mapped to a service.
    service: row.serviceRef?.name ?? row.service ?? null,
    service_id: row.service_id ?? null,
    service_ref: row.serviceRef
      ? {
          id: row.serviceRef.id,
          name: row.serviceRef.name,
          slug: row.serviceRef.slug,
          is_active: Boolean(row.serviceRef.is_active),
        }
      : null,
    source: row.source ?? null,
    status: row.status,
    stage: stageForStatus(row.status),
    assigned_doctor_id: row.assigned_doctor_id ?? null,
    current_team_id: row.current_team_id ?? null,
    current_team: row.currentTeam ? { id: row.currentTeam.id, name: row.currentTeam.name, code: row.currentTeam.code } : null,
    current_owner_id: row.current_owner_id ?? null,
    current_owner: row.currentOwner ? { id: row.currentOwner.id, username: row.currentOwner.username, email: row.currentOwner.email } : null,
    assignment_status: row.current_owner_id ? "ASSIGNED" : "UNASSIGNED",
    assignedDoctor: doctor
      ? { id: doctor.id, name: doctor.name, specialty: doctor.specialty ?? null }
      : null,
    next_follow_up: row.next_follow_up ?? null,
    notes: row.notes ?? null,
    source_provider: row.source_provider ?? null,
    source_external_id: row.source_external_id ?? null,
    source_key: row.integration_metadata?.source_page ??
      (row.source_provider?.startsWith?.("birthwave_") ? row.source_provider : null),
    integration_metadata: row.integration_metadata ?? null,
    custom_fields: row.custom_fields ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const serializeAppointment = (row) => ({
  id: row.id,
  lead_id: row.lead_id,
  doctor_id: row.doctor_id ?? null,
  service: row.service ?? null,
  scheduled_at: row.scheduled_at,
  status: row.status,
  notes: row.notes ?? null,
  lead: row.lead
    ? { id: row.lead.id, name: row.lead.name, phone: row.lead.phone }
    : null,
  doctor: row.doctor ? { id: row.doctor.id, name: row.doctor.name } : null,
});

const leadInclude = () => [
  { model: db.BirthwaveDoctor, as: "assignedDoctor", required: false },
  // BW-SVC-001: the service master row, so the API returns the CURRENT service
  // name even after a rename, and still resolves services since deactivated.
  { model: db.BirthwaveService, as: "serviceRef", required: false },
  { model: db.BirthwaveContact, as: "contact", required: false },
  { model: db.BirthwaveTeam, as: "currentTeam", required: false },
  { model: db.Management, as: "currentOwner", required: false },
];

const appointmentInclude = () => [
  { model: db.BirthwaveLead, as: "lead", required: false },
  { model: db.BirthwaveDoctor, as: "doctor", required: false },
];

// ── Doctors ────────────────────────────────────────────────────────────────
export const listDoctors = async (tenant, query = {}) => {
  const where = clientScope(tenant);
  if (query.active !== undefined && query.active !== "") {
    where.active = query.active === true || query.active === "true";
  }
  if (query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.search}%` } },
      { specialty: { [Op.like]: `%${query.search}%` } },
    ];
  }
  const rows = await db.BirthwaveDoctor.findAll({
    where,
    order: [
      ["active", "DESC"],
      ["name", "ASC"],
    ],
  });
  return rows.map(serializeDoctor);
};

export const createDoctor = async (tenant, data) => {
  const row = await db.BirthwaveDoctor.create({
    client_id: clientScope(tenant).client_id,
    name: data.name.trim(),
    specialty: trimOrNull(data.specialty),
    avatar_url: trimOrNull(data.avatar_url),
    active: data.active ?? true,
  });
  return serializeDoctor(row);
};

export const updateDoctor = async (tenant, id, data) => {
  const row = await db.BirthwaveDoctor.findOne({ where: clientScope(tenant, { id }) });
  if (!row) throw httpError(404, "Doctor not found");
  const patch = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.specialty !== undefined) patch.specialty = trimOrNull(data.specialty);
  if (data.avatar_url !== undefined) patch.avatar_url = trimOrNull(data.avatar_url);
  if (data.active !== undefined) patch.active = Boolean(data.active);
  await row.update(patch);
  return serializeDoctor(row);
};

// ── Leads ──────────────────────────────────────────────────────────────────
const buildLeadWhere = (tenant, query = {}) => {
  const where = clientScope(tenant);

  if (query.status) where.status = normalizeStoredLeadStatus(query.status);
  if (query.source) where.source = query.source;
  if (query.source_provider) where.source_provider = query.source_provider;
  // BW-SVC-001: canonical service filtering is by id, never by display text, so
  // a renamed service keeps filtering correctly.
  if (query.service_id) where.service_id = Number(query.service_id);
  if (query.assigned_doctor_id) where.assigned_doctor_id = Number(query.assigned_doctor_id);
  if (query.team_id) where.current_team_id = Number(query.team_id);
  if (query.owner_id) where.current_owner_id = Number(query.owner_id);
  if (query.assignment_status === "UNASSIGNED") where.current_owner_id = null;
  if (query.assignment_status === "ASSIGNED") where.current_owner_id = { [Op.ne]: null };

  if (query.start_date || query.end_date) {
    const { start, end } = getInclusiveDateRange(query.start_date, query.end_date);
    where.created_at = {
      ...(start ? { [Op.gte]: start } : {}),
      ...(end ? { [Op.lte]: end } : {}),
    };
  }

  if (query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.search}%` } },
      { phone: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
      { service: { [Op.like]: `%${query.search}%` } },
    ];
  }

  if (query.custom_field_key && query.custom_field_value !== undefined) {
    // MySQL JSON extraction: custom_fields.<key> equals the requested value.
    where[Op.and] = [
      ...(where[Op.and] || []),
      literal(
        `JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ${db.sequelize.escape(
          `$.${query.custom_field_key}`,
        )})) = ${db.sequelize.escape(String(query.custom_field_value))}`,
      ),
    ];
  }

  return where;
};

export const listLeads = async (tenant, query = {}, actor = null) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = (page - 1) * limit;

  const where = buildLeadWhere(tenant, query);
  const visibility = await leadVisibilityWhere(tenant.id, actor);
  const visibilityConditions = Object.entries(visibility).map(([field, value]) => ({ [field]: value }));
  const existingAssignmentConditions = [];
  for (const field of ["current_team_id", "current_owner_id"]) {
    if (where[field] !== undefined) {
      existingAssignmentConditions.push({ [field]: where[field] });
      delete where[field];
    }
  }
  if (visibilityConditions.length || existingAssignmentConditions.length) {
    where[Op.and] = [...(where[Op.and] || []), ...visibilityConditions, ...existingAssignmentConditions];
  }
  const { rows, count } = await db.BirthwaveLead.findAndCountAll({
    where,
    include: leadInclude(),
    order: [
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows.map(serializeLead),
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    },
  };
};

export const getLeadById = async (tenant, id, actor = null) => {
  const row = await db.BirthwaveLead.findOne({
    where: clientScope(tenant, { id }),
    include: leadInclude(),
  });
  if (!row) throw httpError(404, "Lead not found");
  if (actor) await assertCanViewLead(tenant.id, row, actor);
  const otherLeadVisibility = actor ? await leadVisibilityWhere(tenant.id, actor) : {};
  const otherLeads = row.contact_id
    ? await db.BirthwaveLead.findAll({
        where: { client_id: tenant.id, contact_id: row.contact_id, id: { [Op.ne]: row.id }, ...otherLeadVisibility },
        order: [["created_at", "DESC"], ["id", "DESC"]],
        limit: 20,
        attributes: ["id", "name", "service", "source", "status", "created_at"],
      })
    : [];
  return {
    ...serializeLead(row),
    other_leads: otherLeads.map((other) => ({
      id: other.id,
      name: other.name,
      service: other.service,
      source: other.source,
      status: other.status,
      stage: stageForStatus(other.status),
      created_at: other.created_at,
    })),
    assignments: await db.BirthwaveLeadAssignment.findAll({
      where: { client_id: tenant.id, lead_id: row.id },
      include: [
        { model: db.BirthwaveTeam, as: "team", required: true },
        { model: db.Management, as: "owner", required: true },
        { model: db.Management, as: "assignedBy", required: false },
      ],
      order: [["assigned_at", "DESC"], ["id", "DESC"]],
    }).then((items) => items.map((item) => ({
      id: item.id,
      team_id: item.team_id,
      team: { id: item.team.id, name: item.team.name, code: item.team.code },
      owner_id: item.owner_id,
      owner: { id: item.owner.id, username: item.owner.username, email: item.owner.email },
      assignment_type: item.assignment_type,
      assigned_by: item.assigned_by,
      reason: item.reason,
      is_current: Boolean(item.is_current),
      assigned_at: item.assigned_at,
      ended_at: item.ended_at,
    }))),
  };
};

const LEAD_WRITABLE = [
  "name",
  "phone",
  "email",
  "service",
  "source",
  "status",
  "assigned_doctor_id",
  "notes",
  "custom_fields",
];

const normalizeLeadPatch = (data) => {
  const patch = {};
  for (const key of LEAD_WRITABLE) {
    if (data[key] === undefined) continue;
    if (key === "assigned_doctor_id") {
      patch[key] = data[key] ? Number(data[key]) : null;
    } else if (key === "custom_fields") {
      patch[key] = data[key] && typeof data[key] === "object" ? data[key] : {};
    } else if (typeof data[key] === "string") {
      patch[key] = key === "name" || key === "phone" ? data[key].trim() : trimOrNull(data[key]);
    } else {
      patch[key] = data[key];
    }
  }
  return patch;
};

/**
 * BW-SVC-001: resolves a Lead's service into `{ service_id, service }`.
 *
 * `service_id` is canonical; `service` keeps the human-readable name so the
 * legacy compatibility column stays populated and readable. Returns `{}` when
 * the caller supplied nothing at all, so a patch that never mentions a service
 * leaves the existing values untouched.
 */
const resolveLeadServiceLink = async (tenant, data, textFallback) => {
  const clientId = clientScope(tenant).client_id;
  const hasExplicit = data.service_id !== undefined || data.service_slug !== undefined;
  const text = textFallback !== undefined ? textFallback : data.service;
  if (!hasExplicit && (text === undefined || text === null)) return {};

  if (hasExplicit && data.service_id === null) {
    // Explicitly clearing the service.
    return { service_id: null, service: null };
  }

  const { service } = await resolveServiceForIntake({
    clientId,
    serviceId: data.service_id,
    slug: data.service_slug,
    text,
  });
  if (service) return { service_id: service.id, service: service.name };

  // Unrecognised free text: keep it in the compatibility column rather than
  // guessing a service. service_id stays null and the value is reportable.
  return { service_id: null, service: text ?? null };
};

const assertDoctorInClient = async (tenant, doctorId) => {
  if (!doctorId) return;
  const doctor = await db.BirthwaveDoctor.findOne({
    where: clientScope(tenant, { id: doctorId }),
    attributes: ["id"],
  });
  if (!doctor) throw httpError(400, "Assigned doctor does not belong to this client");
};

export const createLead = async (tenant, data, actor) => {
  const patch = normalizeLeadPatch(data);
  if (stageForStatus(patch.status || "new_lead") !== "NEW") throw httpError(400, "New Leads must enter through the NEW routing state before assignment");
  await assertDoctorInClient(tenant, patch.assigned_doctor_id);
  // BW-SVC-001: resolve the canonical service. An explicit service_id is
  // validated against this tenant and must be active; free text still resolves
  // by name/slug so older integrations keep working. The legacy `service` text
  // is written alongside service_id and is not dropped.
  const serviceLink = await resolveLeadServiceLink(tenant, data, patch.service);
  const resolved = await resolveOrCreateBirthwaveContact({
    clientId: clientScope(tenant).client_id,
    name: patch.name,
    phone: patch.phone,
    email: patch.email,
  });

  const row = await db.BirthwaveLead.create({
    client_id: clientScope(tenant).client_id,
    contact_id: resolved.contact?.id ?? null,
    custom_fields: {},
    ...patch,
    ...serviceLink,
    status: normalizeStoredLeadStatus(patch.status),
    source_provider: trimOrNull(data.source_provider),
    source_external_id: trimOrNull(data.source_external_id),
  });

  await logBirthwaveActivity({
    clientId: row.client_id,
    leadId: row.id,
    actor,
    eventType: "lead_created",
    title: "Lead created",
    description: `${row.name} · ${row.phone}`,
  });

  if (resolved.contact) {
    await logBirthwaveActivity({
      clientId: row.client_id,
      leadId: row.id,
      actor,
      eventType: "contact_resolved",
      title: "Contact linked",
      description: `Contact ${resolved.contact.id} resolved by ${resolved.matchMethod}`,
    });
  }

  // Routing is additive and rule-driven. With no matching rule the Lead
  // remains NEW/UNASSIGNED; Task/Next Action behavior belongs to a later phase.
  try {
    const { routeLeadByRules } = await import("./birthwaveAssignment.service.js");
    await routeLeadByRules({ tenant, leadId: row.id, actor });
  } catch (error) {
    await logBirthwaveActivity({ clientId: row.client_id, leadId: row.id, actor, eventType: "routing_failed", title: "Routing failed", description: error.message });
  }

  return getLeadById(tenant, row.id);
};

export const updateLead = async (tenant, id, data, actor) => {
  const row = await db.BirthwaveLead.findOne({ where: clientScope(tenant, { id }) });
  if (!row) throw httpError(404, "Lead not found");
  await assertCanEditLead(tenant.id, row, actor);

  const patch = normalizeLeadPatch(data);
  await assertDoctorInClient(tenant, patch.assigned_doctor_id);
  // BW-SVC-001: a telecaller correcting the service after the first call is the
  // documented "Not sure yet → real service" path, so updates resolve the same
  // way creates do and keep service_id and the legacy text in step.
  Object.assign(patch, await resolveLeadServiceLink(tenant, data, patch.service));

  if (patch.status !== undefined) patch.status = normalizeStoredLeadStatus(patch.status);
  const requestedStage = stageForStatus(patch.status ?? row.status);
  if (patch.status !== undefined && ACTIVE_OPERATIONAL_STAGES.has(requestedStage)) {
    if (!row.current_team_id || !row.current_owner_id) throw httpError(400, "An active operational Lead requires a Team and Owner");
    const primaryTask = db.BirthwaveTask && await db.BirthwaveTask.findOne({
      where: { client_id: row.client_id, lead_id: row.id, is_primary: true, status: { [Op.in]: ["PENDING", "IN_PROGRESS", "OVERDUE"] } },
      attributes: ["id"],
    });
    if (!primaryTask) throw httpError(409, "An active operational Lead requires one Primary Next Action");
  }
  if (patch.name !== undefined || patch.phone !== undefined || patch.email !== undefined) {
    const resolved = await resolveOrCreateBirthwaveContact({
      clientId: row.client_id,
      name: patch.name ?? row.name,
      phone: patch.phone ?? row.phone,
      email: patch.email ?? row.email,
      allowUnidentified: true,
    });
    if (resolved.contact) patch.contact_id = resolved.contact.id;
  }

  const before = {
    status: row.status,
    assigned_doctor_id: row.assigned_doctor_id,
    custom_fields: row.custom_fields || {},
  };

  await row.update(patch);

  if (patch.status !== undefined && patch.status !== before.status) {
    await logBirthwaveActivity({
      clientId: row.client_id,
      leadId: row.id,
      actor,
      eventType: "status_changed",
      title: "Status updated",
      previousValue: before.status,
      newValue: patch.status,
    });
  }

  if (
    patch.assigned_doctor_id !== undefined &&
    Number(patch.assigned_doctor_id) !== Number(before.assigned_doctor_id)
  ) {
    await logBirthwaveActivity({
      clientId: row.client_id,
      leadId: row.id,
      actor,
      eventType: "assignment_changed",
      title: "Doctor assignment changed",
      previousValue: before.assigned_doctor_id,
      newValue: patch.assigned_doctor_id,
    });
  }

  if (patch.custom_fields !== undefined) {
    const changedKeys = Object.keys(patch.custom_fields).filter(
      (key) =>
        JSON.stringify(patch.custom_fields[key]) !==
        JSON.stringify(before.custom_fields?.[key]),
    );
    if (changedKeys.length > 0) {
      await logBirthwaveActivity({
        clientId: row.client_id,
        leadId: row.id,
        actor,
        eventType: "custom_field_changed",
        title: "Custom fields updated",
        description: changedKeys.join(", "),
      });
    }
  }

  return getLeadById(tenant, row.id);
};

// ── Appointments ───────────────────────────────────────────────────────────
const buildAppointmentWhere = (tenant, query = {}) => {
  const where = clientScope(tenant);
  if (query.status) where.status = query.status;
  if (query.doctor_id) where.doctor_id = Number(query.doctor_id);
  if (query.lead_id) where.lead_id = Number(query.lead_id);

  if (query.start_date || query.end_date) {
    const { start, end } = getInclusiveDateRange(query.start_date, query.end_date);
    where.scheduled_at = {
      ...(start ? { [Op.gte]: start } : {}),
      ...(end ? { [Op.lte]: end } : {}),
    };
  }
  return where;
};

export const listAppointments = async (tenant, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = (page - 1) * limit;

  const { rows, count } = await db.BirthwaveAppointment.findAndCountAll({
    where: buildAppointmentWhere(tenant, query),
    include: appointmentInclude(),
    order: [
      ["scheduled_at", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows.map(serializeAppointment),
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    },
  };
};

const getAppointmentRow = async (tenant, id) => {
  const row = await db.BirthwaveAppointment.findOne({
    where: clientScope(tenant, { id }),
    include: appointmentInclude(),
  });
  if (!row) throw httpError(404, "Appointment not found");
  return row;
};

export const createAppointment = async (tenant, data, actor) => {
  const clientId = clientScope(tenant).client_id;
  await assertDoctorInClient(tenant, data.doctor_id ? Number(data.doctor_id) : null);
  const transaction = await db.sequelize.transaction();
  let row;
  try {
    const lead = await db.BirthwaveLead.findOne({ where: { client_id: clientId, id: Number(data.lead_id) }, lock: transaction.LOCK.UPDATE, transaction });
    if (!lead) throw httpError(400, "Lead does not belong to this client");
    row = await db.BirthwaveAppointment.create({
      client_id: clientId,
      lead_id: Number(data.lead_id),
      doctor_id: data.doctor_id ? Number(data.doctor_id) : null,
      service: trimOrNull(data.service),
      scheduled_at: parseAppDateTime(data.scheduled_at),
      status: data.status || "scheduled",
      notes: trimOrNull(data.notes),
    }, { transaction });
    await logBirthwaveActivity({ clientId, leadId: row.lead_id, actor, eventType: "appointment_created", title: "Appointment created", newValue: row.scheduled_at, transaction });
    if (row.status === "scheduled") await createAppointmentContinuationInTransaction({ clientId, lead, appointment: row, actor, transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  return serializeAppointment(await getAppointmentRow(tenant, row.id));
};

export const updateAppointment = async (tenant, id, data, actor) => {
  const clientId = clientScope(tenant).client_id;
  if (data.doctor_id !== undefined) await assertDoctorInClient(tenant, data.doctor_id ? Number(data.doctor_id) : null);
  const transaction = await db.sequelize.transaction();
  try {
    const row = await db.BirthwaveAppointment.findOne({ where: clientScope(tenant, { id }), transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw httpError(404, "Appointment not found");
    const lead = await db.BirthwaveLead.findOne({ where: clientScope(tenant, { id: row.lead_id }), transaction, lock: transaction.LOCK.UPDATE });
    if (!lead) throw httpError(400, "Appointment Lead not found");
    const patch = {};
    if (data.doctor_id !== undefined) patch.doctor_id = data.doctor_id ? Number(data.doctor_id) : null;
    if (data.service !== undefined) patch.service = trimOrNull(data.service);
    if (data.scheduled_at !== undefined) patch.scheduled_at = parseAppDateTime(data.scheduled_at);
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = trimOrNull(data.notes);
    const previousStatus = row.status;
    await row.update(patch, { transaction });
    await applyAppointmentStatusContinuationInTransaction({ clientId, lead, appointment: row, previousStatus, actor, transaction, continuation: data.continuation || null });
    await transaction.commit();
    return serializeAppointment(await getAppointmentRow(tenant, row.id));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// ── Dashboard ──────────────────────────────────────────────────────────────
const percentage = (part, total) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

export const getDashboard = async (tenant, query = {}, actor = null) => {
  const clientId = clientScope(tenant).client_id;
  const { start, end } = getInclusiveDateRange(query.start_date, query.end_date);
  const source = query.source || null;

  const leadRangeWhere = {
    client_id: clientId,
    ...(source ? { source } : {}),
    ...(start || end
      ? {
          created_at: {
            ...(start ? { [Op.gte]: start } : {}),
            ...(end ? { [Op.lte]: end } : {}),
          },
        }
      : {}),
  };

  const apptRangeWhere = {
    client_id: clientId,
    ...(start || end
      ? {
          scheduled_at: {
            ...(start ? { [Op.gte]: start } : {}),
            ...(end ? { [Op.lte]: end } : {}),
          },
        }
      : {}),
  };

  const { start: todayStart, end: todayEnd } = getTodayBounds();

  const [
    totalLeads,
    newLeadsToday,
    appointmentsBooked,
    confirmedVisits,
    noShows,
    convertedLeads,
    leadsOverTimeRows,
    leadSourceRows,
    doctorApptRows,
    pipelineRows,
    recentLeadRows,
    followUpRows,
    todayScheduleRows,
  ] = await Promise.all([
    db.BirthwaveLead.count({ where: leadRangeWhere }),
    db.BirthwaveLead.count({
      where: {
        client_id: clientId,
        ...(source ? { source } : {}),
        created_at: { [Op.gte]: todayStart, [Op.lte]: todayEnd },
      },
    }),
    db.BirthwaveAppointment.count({ where: apptRangeWhere }),
    db.BirthwaveAppointment.count({
      where: { ...apptRangeWhere, status: { [Op.in]: ["confirmed", "completed"] } },
    }),
    db.BirthwaveAppointment.count({
      where: { ...apptRangeWhere, status: "no_show" },
    }),
    db.BirthwaveLead.count({ where: { ...leadRangeWhere, status: "CONVERTED" } }), // BW-FIX-002: status is canonical-stage form
    db.BirthwaveLead.findAll({
      where: leadRangeWhere,
      attributes: [
        [fn("DATE", col("created_at")), "date"],
        [fn("COUNT", col("id")), "count"],
      ],
      group: [fn("DATE", col("created_at"))],
      order: [[literal("date"), "ASC"]],
      raw: true,
    }),
    db.BirthwaveLead.findAll({
      where: leadRangeWhere,
      attributes: ["source", [fn("COUNT", col("id")), "count"]],
      group: ["source"],
      raw: true,
    }),
    db.BirthwaveAppointment.findAll({
      where: { ...apptRangeWhere, doctor_id: { [Op.ne]: null } },
      attributes: ["doctor_id", [fn("COUNT", col("id")), "count"]],
      group: ["doctor_id"],
      order: [[literal("count"), "DESC"]],
      raw: true,
    }),
    db.BirthwaveLead.findAll({
      where: leadRangeWhere,
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    }),
    db.BirthwaveLead.findAll({
      where: leadRangeWhere,
      include: leadInclude(),
      order: [["created_at", "DESC"], ["id", "DESC"]],
      limit: 8,
    }),
    // BW-UI-002: the dashboard follow-up panel used to read
    // birthwave_leads.next_follow_up, which only the manual Lead form ever
    // writes — the task engine records a FOLLOW_UP task instead and never
    // touches that column, so the panel was permanently empty (0 of 21 leads
    // carry a value). Follow-ups are read from the canonical task store; the
    // owning Lead's serialized next_follow_up is projected from the task's
    // due_at below so the existing API/UI contract is unchanged.
    db.BirthwaveTask.findAll({
      where: {
        client_id: clientId,
        task_type: "FOLLOW_UP",
        status: { [Op.in]: ["PENDING", "IN_PROGRESS"] },
      },
      include: [{ model: db.BirthwaveLead, as: "lead", required: true, include: leadInclude() }],
      order: [["due_at", "ASC"]],
      limit: 10,
    }),
    db.BirthwaveAppointment.findAll({
      where: {
        client_id: clientId,
        scheduled_at: { [Op.gte]: todayStart, [Op.lte]: todayEnd },
      },
      include: appointmentInclude(),
      order: [["scheduled_at", "ASC"]],
    }),
  ]);

  // BW-UI-001: the dashboard used to merge birthwave_website_leads aggregates
  // into every lead figure below (total, today, over-time, sources, pipeline,
  // recent). That was correct while a website submission produced ONLY a
  // birthwave_website_leads row and had to be promoted to become a CRM Lead.
  // Since the direct-to-Lead refactor, createWebsiteLead() writes the website
  // staging row AND the birthwave_leads row in the same transaction, so every
  // website enquiry now exists in birthwave_leads with source = "website" —
  // merging the staging table on top double-counted all of them. birthwave_leads
  // is the single source for every lead figure on this dashboard.
  const overTimeMerged = new Map();
  for (const r of leadsOverTimeRows) {
    const d = typeof r.date === "string" ? r.date : new Date(r.date).toISOString().slice(0, 10);
    overTimeMerged.set(d, (overTimeMerged.get(d) || 0) + Number(r.count));
  }

  const sourceMerged = new Map();
  for (const r of leadSourceRows) {
    if (!r.source) continue;
    sourceMerged.set(r.source, (sourceMerged.get(r.source) || 0) + Number(r.count));
  }
  const sourceTotal = [...sourceMerged.values()].reduce((a, b) => a + b, 0);

  const recentMerged = recentLeadRows
    .map((r) => ({ ...serializeLead(r), kind: "crm" }))
    .slice(0, 8);

  const doctorIds = doctorApptRows.map((r) => r.doctor_id).filter(Boolean);
  const doctorsById = new Map(
    (doctorIds.length
      ? await db.BirthwaveDoctor.findAll({
          where: { client_id: clientId, id: { [Op.in]: doctorIds } },
          attributes: ["id", "name", "specialty"],
          raw: true,
        })
      : []
    ).map((d) => [d.id, d]),
  );

  return {
    range: { start: query.start_date || null, end: query.end_date || null },
    kpis: {
      total_leads: totalLeads,
      new_leads_today: newLeadsToday,
      appointments_booked: appointmentsBooked,
      confirmed_visits: confirmedVisits,
      no_shows: noShows,
      conversion_rate: percentage(convertedLeads, totalLeads),
    },
    leads_over_time: [...overTimeMerged.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    lead_sources: [...sourceMerged.entries()]
      .map(([src, count]) => ({
        source: src,
        count,
        percentage: percentage(count, sourceTotal),
      }))
      .sort((a, b) => b.count - a.count),
    doctor_wise_appointments: doctorApptRows.map((r) => ({
      doctorId: r.doctor_id,
      name: doctorsById.get(r.doctor_id)?.name ?? "Unknown",
      specialty: doctorsById.get(r.doctor_id)?.specialty ?? null,
      appointmentCount: Number(r.count),
    })),
    // BW-FIX-002: birthwave_leads.status is stored in canonical stage form; match
    // pipelineRows against the stage equivalent of each legacy bucket label so
    // counts don't silently go to zero. BW-UI-001 removed the birthwave_website_leads
    // contribution that used to be added here — website enquiries are already
    // counted once in pipelineRows as ordinary CRM Leads.
    pipeline: BIRTHWAVE_LEAD_STATUSES.map((status) => ({
      status,
      count: Number(pipelineRows.find((r) => r.status === stageForStatus(status))?.count || 0),
    })),
    recent_leads: recentMerged,
    // BW-UI-002: next_follow_up is projected from the FOLLOW_UP task's due_at
    // rather than the stale birthwave_leads column, so the panel shows real
    // engine-created follow-ups without changing the response shape.
    follow_up_reminders: followUpRows
      .filter((task) => task.lead)
      .map((task) => ({ ...serializeLead(task.lead), next_follow_up: task.due_at })),
    today_schedule: todayScheduleRows.map(serializeAppointment),
    operational: await getOperationalDashboard(tenant, query, actor),
  };
};

export const BIRTHWAVE_ENUMS = {
  statuses: BIRTHWAVE_LEAD_STATUSES,
  sources: BIRTHWAVE_LEAD_SOURCES,
};
