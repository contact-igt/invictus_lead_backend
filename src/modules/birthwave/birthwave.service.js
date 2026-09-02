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
} from "../../database/tables/BirthwaveLeadTable/index.js";

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
    service: row.service ?? null,
    source: row.source ?? null,
    status: row.status,
    assigned_doctor_id: row.assigned_doctor_id ?? null,
    assignedDoctor: doctor
      ? { id: doctor.id, name: doctor.name, specialty: doctor.specialty ?? null }
      : null,
    next_follow_up: row.next_follow_up ?? null,
    notes: row.notes ?? null,
    source_provider: row.source_provider ?? null,
    source_external_id: row.source_external_id ?? null,
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

  if (query.status) where.status = query.status;
  if (query.source) where.source = query.source;
  if (query.assigned_doctor_id) where.assigned_doctor_id = Number(query.assigned_doctor_id);

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

export const listLeads = async (tenant, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = (page - 1) * limit;

  const { rows, count } = await db.BirthwaveLead.findAndCountAll({
    where: buildLeadWhere(tenant, query),
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

export const getLeadById = async (tenant, id) => {
  const row = await db.BirthwaveLead.findOne({
    where: clientScope(tenant, { id }),
    include: leadInclude(),
  });
  if (!row) throw httpError(404, "Lead not found");
  return serializeLead(row);
};

const LEAD_WRITABLE = [
  "name",
  "phone",
  "email",
  "service",
  "source",
  "status",
  "assigned_doctor_id",
  "next_follow_up",
  "notes",
  "custom_fields",
];

const normalizeLeadPatch = (data) => {
  const patch = {};
  for (const key of LEAD_WRITABLE) {
    if (data[key] === undefined) continue;
    if (key === "assigned_doctor_id") {
      patch[key] = data[key] ? Number(data[key]) : null;
    } else if (key === "next_follow_up") {
      patch[key] = data[key] ? parseAppDateTime(data[key]) : null;
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
  await assertDoctorInClient(tenant, patch.assigned_doctor_id);

  const row = await db.BirthwaveLead.create({
    client_id: clientScope(tenant).client_id,
    status: "new_lead",
    custom_fields: {},
    ...patch,
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

  if (row.next_follow_up) {
    await logBirthwaveActivity({
      clientId: row.client_id,
      leadId: row.id,
      actor,
      eventType: "follow_up_scheduled",
      title: "Follow-up scheduled",
      newValue: row.next_follow_up,
    });
  }

  return getLeadById(tenant, row.id);
};

export const updateLead = async (tenant, id, data, actor) => {
  const row = await db.BirthwaveLead.findOne({ where: clientScope(tenant, { id }) });
  if (!row) throw httpError(404, "Lead not found");

  const patch = normalizeLeadPatch(data);
  await assertDoctorInClient(tenant, patch.assigned_doctor_id);

  const before = {
    status: row.status,
    assigned_doctor_id: row.assigned_doctor_id,
    next_follow_up: row.next_follow_up,
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

  if (
    patch.next_follow_up !== undefined &&
    String(patch.next_follow_up) !== String(before.next_follow_up)
  ) {
    await logBirthwaveActivity({
      clientId: row.client_id,
      leadId: row.id,
      actor,
      eventType: "follow_up_scheduled",
      title: patch.next_follow_up ? "Follow-up rescheduled" : "Follow-up cleared",
      previousValue: before.next_follow_up,
      newValue: patch.next_follow_up,
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

  const lead = await db.BirthwaveLead.findOne({
    where: { client_id: clientId, id: Number(data.lead_id) },
    attributes: ["id"],
  });
  if (!lead) throw httpError(400, "Lead does not belong to this client");
  await assertDoctorInClient(tenant, data.doctor_id ? Number(data.doctor_id) : null);

  const row = await db.BirthwaveAppointment.create({
    client_id: clientId,
    lead_id: Number(data.lead_id),
    doctor_id: data.doctor_id ? Number(data.doctor_id) : null,
    service: trimOrNull(data.service),
    scheduled_at: parseAppDateTime(data.scheduled_at),
    status: data.status || "scheduled",
    notes: trimOrNull(data.notes),
  });

  await logBirthwaveActivity({
    clientId,
    leadId: row.lead_id,
    actor,
    eventType: "appointment_created",
    title: "Appointment created",
    newValue: row.scheduled_at,
  });

  return serializeAppointment(await getAppointmentRow(tenant, row.id));
};

export const updateAppointment = async (tenant, id, data, actor) => {
  const row = await getAppointmentRow(tenant, id);
  const patch = {};
  if (data.doctor_id !== undefined) {
    await assertDoctorInClient(tenant, data.doctor_id ? Number(data.doctor_id) : null);
    patch.doctor_id = data.doctor_id ? Number(data.doctor_id) : null;
  }
  if (data.service !== undefined) patch.service = trimOrNull(data.service);
  if (data.scheduled_at !== undefined) patch.scheduled_at = parseAppDateTime(data.scheduled_at);
  if (data.status !== undefined) patch.status = data.status;
  if (data.notes !== undefined) patch.notes = trimOrNull(data.notes);

  const previousStatus = row.status;
  await row.update(patch);

  if (patch.status && patch.status !== previousStatus) {
    await logBirthwaveActivity({
      clientId: row.client_id,
      leadId: row.lead_id,
      actor,
      eventType: "appointment_created",
      title: `Appointment ${patch.status.replace(/_/g, " ")}`,
      previousValue: previousStatus,
      newValue: patch.status,
    });
  }

  return serializeAppointment(await getAppointmentRow(tenant, row.id));
};

// ── Dashboard ──────────────────────────────────────────────────────────────
const percentage = (part, total) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

export const getDashboard = async (tenant, query = {}) => {
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
    db.BirthwaveLead.count({ where: { ...leadRangeWhere, status: "converted" } }),
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
    db.BirthwaveLead.findAll({
      where: {
        client_id: clientId,
        next_follow_up: { [Op.ne]: null },
      },
      include: leadInclude(),
      order: [["next_follow_up", "ASC"]],
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

  // ── Website / landing-page enquiries count as leads on the dashboard ──────
  const webRangeWhere = {
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

  const [
    webTotal,
    webToday,
    webConverted,
    webOverTimeRows,
    webSourceRows,
    webPipelineRows,
    webRecentRows,
  ] = await Promise.all([
    db.BirthwaveWebsiteLead.count({ where: webRangeWhere }),
    db.BirthwaveWebsiteLead.count({
      where: {
        client_id: clientId,
        ...(source ? { source } : {}),
        created_at: { [Op.gte]: todayStart, [Op.lte]: todayEnd },
      },
    }),
    db.BirthwaveWebsiteLead.count({ where: { ...webRangeWhere, status: "Converted" } }),
    db.BirthwaveWebsiteLead.findAll({
      where: webRangeWhere,
      attributes: [
        [fn("DATE", col("created_at")), "date"],
        [fn("COUNT", col("id")), "count"],
      ],
      group: [fn("DATE", col("created_at"))],
      raw: true,
    }),
    db.BirthwaveWebsiteLead.findAll({
      where: webRangeWhere,
      attributes: ["source", [fn("COUNT", col("id")), "count"]],
      group: ["source"],
      raw: true,
    }),
    db.BirthwaveWebsiteLead.findAll({
      where: webRangeWhere,
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    }),
    db.BirthwaveWebsiteLead.findAll({
      where: webRangeWhere,
      order: [["created_at", "DESC"], ["id", "DESC"]],
      limit: 8,
    }),
  ]);

  // Website enquiry status -> CRM pipeline stage.
  const WEB_STATUS_TO_STAGE = {
    New: "new_lead",
    Contacted: "contacted",
    "In Progress": "consultation_booked",
    Converted: "converted",
  };
  const webStageCounts = {};
  for (const row of webPipelineRows) {
    const stage = WEB_STATUS_TO_STAGE[row.status];
    if (stage) webStageCounts[stage] = (webStageCounts[stage] || 0) + Number(row.count);
  }

  const overTimeMerged = new Map();
  const addOverTime = (rows) => {
    for (const r of rows) {
      const d =
        typeof r.date === "string" ? r.date : new Date(r.date).toISOString().slice(0, 10);
      overTimeMerged.set(d, (overTimeMerged.get(d) || 0) + Number(r.count));
    }
  };
  addOverTime(leadsOverTimeRows);
  addOverTime(webOverTimeRows);

  const sourceMerged = new Map();
  for (const r of [...leadSourceRows, ...webSourceRows]) {
    if (!r.source) continue;
    sourceMerged.set(r.source, (sourceMerged.get(r.source) || 0) + Number(r.count));
  }
  const sourceTotal = [...sourceMerged.values()].reduce((a, b) => a + b, 0);

  const combinedTotal = totalLeads + webTotal;
  const combinedConverted = convertedLeads + webConverted;

  const serializeWebsiteAsRecent = (row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    service: row.service ?? null,
    source: row.source ?? null,
    status: row.status,
    assigned_doctor_id: null,
    assignedDoctor: null,
    next_follow_up: null,
    notes: row.message ?? null,
    source_provider: row.source_key,
    source_external_id: row.external_lead_id ?? null,
    custom_fields: {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    kind: "website",
    source_key: row.source_key,
  });

  const recentMerged = [
    ...recentLeadRows.map((r) => ({ ...serializeLead(r), kind: "crm" })),
    ...webRecentRows.map(serializeWebsiteAsRecent),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
      total_leads: combinedTotal,
      new_leads_today: newLeadsToday + webToday,
      appointments_booked: appointmentsBooked,
      confirmed_visits: confirmedVisits,
      no_shows: noShows,
      conversion_rate: percentage(combinedConverted, combinedTotal),
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
    pipeline: BIRTHWAVE_LEAD_STATUSES.map((status) => ({
      status,
      count:
        Number(pipelineRows.find((r) => r.status === status)?.count || 0) +
        (webStageCounts[status] || 0),
    })),
    recent_leads: recentMerged,
    follow_up_reminders: followUpRows.map(serializeLead),
    today_schedule: todayScheduleRows.map(serializeAppointment),
  };
};

export const BIRTHWAVE_ENUMS = {
  statuses: BIRTHWAVE_LEAD_STATUSES,
  sources: BIRTHWAVE_LEAD_SOURCES,
};
