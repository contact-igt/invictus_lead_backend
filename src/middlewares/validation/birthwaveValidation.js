import Joi from "joi";
import {
  BIRTHWAVE_LEAD_STATUSES,
  BIRTHWAVE_LEAD_STAGES,
  BIRTHWAVE_LEAD_SOURCES,
} from "../../database/tables/BirthwaveLeadTable/index.js";
import { BIRTHWAVE_APPOINTMENT_STATUSES } from "../../database/tables/BirthwaveAppointmentTable/index.js";
import {
  BIRTHWAVE_WEBSITE_SOURCE_KEYS,
  BIRTHWAVE_WEBSITE_LEAD_STATUSES,
} from "../../database/tables/BirthwaveWebsiteLeadTable/index.js";
import { BIRTHWAVE_TASK_PRIORITIES, BIRTHWAVE_TASK_STATUSES, BIRTHWAVE_TASK_TYPES } from "../../database/tables/BirthwaveTaskTable/index.js";
import { BIRTHWAVE_CONTACT_RESULTS, BIRTHWAVE_DISPOSITIONS, BIRTHWAVE_NEXT_ACTION_TYPES, BIRTHWAVE_NOT_REACHED_REASONS } from "../../database/tables/BirthwaveDispositionTable/index.js";
import { BIRTHWAVE_ATTENTION_STATUSES, BIRTHWAVE_ATTENTION_TYPES, BIRTHWAVE_ATTENTION_SEVERITIES } from "../../database/tables/BirthwaveAttentionTable/index.js";

const CLIENT_KEY = Joi.string().trim().lowercase().max(120).optional();
const phone = Joi.string().trim().max(30).pattern(/^[0-9+\-()\s]+$/);
const nullableText = (max) => Joi.string().trim().max(max).allow(null, "").optional();
const leadStatusInput = Joi.string().valid(...BIRTHWAVE_LEAD_STATUSES, ...BIRTHWAVE_LEAD_STAGES);

const validate = (source, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    convert: true,
    stripUnknown: source === "query",
  });
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((d) => d.message),
    });
  }
  if (source === "query") {
    Object.defineProperty(req, "query", {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    req[source] = value;
  }
  next();
};

// ── Params ──
const idSchema = Joi.object({ id: Joi.number().integer().positive().required() });
export const validateBirthwaveId = validate("params", idSchema);
const teamMemberIdSchema = Joi.object({ id: Joi.number().integer().positive().required(), memberId: Joi.number().integer().positive().required() });
export const validateBirthwaveTeamMemberId = validate("params", teamMemberIdSchema);

// ── Dashboard ──
const dashboardQuery = Joi.object({
  range: Joi.string().valid("today", "last_7_days", "last_30_days", "custom", "7d", "30d").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  source: Joi.string().valid(...BIRTHWAVE_LEAD_SOURCES).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveDashboard = validate("query", dashboardQuery);

const attentionListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(25),
  status: Joi.string().valid(...BIRTHWAVE_ATTENTION_STATUSES).allow("").optional(), attention_type: Joi.string().valid(...BIRTHWAVE_ATTENTION_TYPES).allow("").optional(), severity: Joi.string().valid(...BIRTHWAVE_ATTENTION_SEVERITIES).allow("").optional(),
  team_id: Joi.number().integer().positive().optional(), owner_id: Joi.number().integer().positive().optional(), lead_id: Joi.number().integer().positive().optional(), date_from: Joi.date().iso().optional(), date_to: Joi.date().iso().optional(), _client_key: CLIENT_KEY, client_key: CLIENT_KEY,
}).unknown(false);
export const validateBirthwaveAttentionList = validate("query", attentionListQuery);
export const validateBirthwaveAttentionReconcile = validate("body", Joi.object({}).unknown(false));
export const validateBirthwaveAttentionAction = validate("body", Joi.object({ resolution_note: nullableText(2000) }).unknown(false));

// ── Leads ──
const leadListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  search: Joi.string().trim().max(255).allow("").optional(),
  status: leadStatusInput.allow("").optional(),
  source: Joi.string().valid(...BIRTHWAVE_LEAD_SOURCES).allow("").optional(),
  service_id: Joi.number().integer().positive().optional(),
  assigned_doctor_id: Joi.number().integer().positive().optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  custom_field_key: Joi.string().trim().max(80).optional(),
  custom_field_value: Joi.string().trim().max(255).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveLeadList = validate("query", leadListQuery);

const teamListQuery = Joi.object({
  active: Joi.boolean().optional(),
  search: Joi.string().trim().max(255).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveTeamList = validate("query", teamListQuery);

const teamCreateSchema = Joi.object({
  name: Joi.string().trim().max(120).required(),
  code: Joi.string().trim().max(80).pattern(/^[a-zA-Z0-9_-]+$/).optional(),
  description: nullableText(2000),
  is_active: Joi.boolean().optional(),
  initial_members: Joi.array().items(Joi.object({
    management_id: Joi.number().integer().positive().required(),
    operational_role: Joi.string().valid("TEAM_MANAGER", "TELECALLER").required(),
    assignment_enabled: Joi.boolean().optional(),
    status: Joi.string().valid("ACTIVE", "ASSIGNMENT_PAUSED", "INACTIVE").optional(),
    service_access: Joi.array().items(Joi.string().trim().max(255)).max(100).optional(),
    source_access: Joi.array().items(Joi.string().trim().max(80)).max(100).optional(),
  }).unknown(false)).max(100).optional(),
}).unknown(false);
export const validateBirthwaveTeamCreate = validate("body", teamCreateSchema);
export const validateBirthwaveTeamUpdate = validate("body", teamCreateSchema.fork(["name"], (s) => s.optional()).min(1));

const teamMemberCreateSchema = Joi.object({
  management_id: Joi.number().integer().positive().required(),
  operational_role: Joi.string().valid("TEAM_MANAGER", "TELECALLER").required(),
  assignment_enabled: Joi.boolean().optional(),
  status: Joi.string().valid("ACTIVE", "ASSIGNMENT_PAUSED", "INACTIVE").optional(),
  service_access: Joi.array().items(Joi.string().trim().max(255)).max(100).optional(),
  source_access: Joi.array().items(Joi.string().trim().max(80)).max(100).optional(),
}).unknown(false);
export const validateBirthwaveTeamMemberCreate = validate("body", teamMemberCreateSchema);
export const validateBirthwaveTeamMemberUpdate = validate("body", teamMemberCreateSchema.fork(["management_id", "operational_role"], (s) => s.optional()).min(1));

const assignmentSchema = Joi.object({
  team_id: Joi.number().integer().positive().required(),
  owner_id: Joi.number().integer().positive().required(),
  reason: nullableText(500),
}).unknown(false);
export const validateBirthwaveAssignment = validate("body", assignmentSchema);
export const validateBirthwaveBulkAssignment = validate("body", assignmentSchema.keys({ lead_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required() }));

const assignmentRuleSchema = Joi.object({
  name: Joi.string().trim().max(160).required(),
  priority: Joi.number().integer().min(0).max(100000).optional(),
  service: nullableText(255),
  // BW-SVC-001: canonical routing criterion; `service` text stays for compatibility.
  service_id: Joi.number().integer().positive().allow(null).optional(),
  source: nullableText(80),
  team_id: Joi.number().integer().positive().required(),
  assignment_method: Joi.string().valid("MANUAL", "ROUND_ROBIN").required(),
  is_active: Joi.boolean().optional(),
}).unknown(false);
export const validateBirthwaveAssignmentRuleCreate = validate("body", assignmentRuleSchema);
export const validateBirthwaveAssignmentRuleUpdate = validate("body", assignmentRuleSchema.fork(["name", "team_id", "assignment_method"], (s) => s.optional()).min(1));

const leadCreateSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  phone: phone.required(),
  email: Joi.string().trim().email().max(200).allow(null, "").optional(),
  service: nullableText(255),
  // BW-SVC-001: canonical service reference. `service` text remains accepted so
  // existing integrations keep working; when both are sent, service_id wins.
  service_id: Joi.number().integer().positive().allow(null).optional(),
  service_slug: Joi.string().trim().max(160).allow(null, "").optional(),
  source: Joi.string().valid(...BIRTHWAVE_LEAD_SOURCES).allow(null, "").optional(),
  status: leadStatusInput.optional(),
  assigned_doctor_id: Joi.number().integer().positive().allow(null).optional(),
  next_follow_up: Joi.alternatives(Joi.date().iso(), Joi.string().allow("")).optional(),
  notes: nullableText(5000),
  source_provider: nullableText(50),
  source_external_id: nullableText(191),
  custom_fields: Joi.object().unknown(true).optional(),
}).unknown(false);
export const validateBirthwaveLeadCreate = validate("body", leadCreateSchema);

const leadUpdateSchema = leadCreateSchema
  .fork(["name", "phone"], (s) => s.optional())
  .min(1);
export const validateBirthwaveLeadUpdate = validate("body", leadUpdateSchema);

const leadNoteSchema = Joi.object({
  note: Joi.string().trim().max(5000).required(),
}).unknown(false);
export const validateBirthwaveLeadNote = validate("body", leadNoteSchema);

// ── Unified task engine ──
const taskListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  status: Joi.string().valid(...BIRTHWAVE_TASK_STATUSES).allow("").optional(),
  task_type: Joi.string().valid(...BIRTHWAVE_TASK_TYPES).allow("").optional(),
  owner_id: Joi.number().integer().positive().optional(),
  team_id: Joi.number().integer().positive().optional(),
  lead_id: Joi.number().integer().positive().optional(),
  due_from: Joi.date().iso().optional(),
  due_to: Joi.date().iso().optional(),
  priority: Joi.string().valid(...BIRTHWAVE_TASK_PRIORITIES).allow("").optional(),
  is_primary: Joi.boolean().optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveTaskList = validate("query", taskListQuery);

const workQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().max(120).allow("").optional(),
  task_type: Joi.string().valid(...BIRTHWAVE_TASK_TYPES).allow("").optional(),
  owner_id: Joi.number().integer().positive().optional(),
  team_id: Joi.number().integer().positive().optional(),
  priority: Joi.string().valid(...BIRTHWAVE_TASK_PRIORITIES).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(false);
export const validateBirthwaveWorkQuery = validate("query", workQuery);

const taskCreateSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  team_id: Joi.number().integer().positive().required(),
  owner_id: Joi.number().integer().positive().required(),
  task_type: Joi.string().valid("MANUAL_TASK").default("MANUAL_TASK"),
  priority: Joi.string().valid(...BIRTHWAVE_TASK_PRIORITIES).default("NORMAL"),
  due_at: Joi.date().iso().required(),
  is_primary: Joi.boolean().optional(),
  metadata: Joi.object().unknown(true).optional(),
}).unknown(false);
export const validateBirthwaveTaskCreate = validate("body", taskCreateSchema);

export const validateBirthwaveTaskStart = validate("body", Joi.object({}).unknown(false));

const successorSchema = Joi.object({
  task_type: Joi.string().valid("MANUAL_TASK").default("MANUAL_TASK"),
  due_at: Joi.date().iso().required(),
  priority: Joi.string().valid(...BIRTHWAVE_TASK_PRIORITIES).optional(),
}).unknown(false);
export const validateBirthwaveTaskComplete = validate("body", Joi.object({
  completion_reason: Joi.string().trim().max(500).required(),
  successor: successorSchema.optional(),
}).unknown(false));
export const validateBirthwaveTaskReschedule = validate("body", Joi.object({
  due_at: Joi.date().iso().required(),
  reason: Joi.string().trim().max(500).required(),
  priority: Joi.string().valid(...BIRTHWAVE_TASK_PRIORITIES).optional(),
}).unknown(false));
export const validateBirthwaveTaskCancel = validate("body", Joi.object({
  reason: Joi.string().trim().max(500).required(),
  successor: successorSchema.optional(),
}).unknown(false));

const outcomeAppointmentSchema = Joi.object({
  doctor_id: Joi.number().integer().positive().allow(null).optional(),
  scheduled_at: Joi.date().iso().required(),
  service: nullableText(255),
  notes: nullableText(5000),
}).unknown(false);
const outcomeSchema = Joi.object({
  outcome_event_id: Joi.string().trim().max(191).required(),
  contact_result: Joi.string().valid(...BIRTHWAVE_CONTACT_RESULTS).required(),
  not_reached_reason: Joi.string().valid(...BIRTHWAVE_NOT_REACHED_REASONS).optional(),
  disposition: Joi.string().valid(...BIRTHWAVE_DISPOSITIONS).allow(null, "").optional(),
  notes: nullableText(5000),
  next_action_type: Joi.string().valid(...BIRTHWAVE_NEXT_ACTION_TYPES).allow(null, "").optional(),
  next_action_due_at: Joi.date().iso().allow(null).optional(),
  lost_reason: Joi.string().trim().max(100).allow(null, "").optional(),
  appointment: outcomeAppointmentSchema.optional(),
}).unknown(false);
export const validateBirthwaveOutcome = validate("body", outcomeSchema);

// ── Doctors ──
const doctorCreateSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  specialty: nullableText(150),
  avatar_url: nullableText(500),
  active: Joi.boolean().optional(),
}).unknown(false);
export const validateBirthwaveDoctorCreate = validate("body", doctorCreateSchema);

const doctorUpdateSchema = doctorCreateSchema.fork(["name"], (s) => s.optional()).min(1);
export const validateBirthwaveDoctorUpdate = validate("body", doctorUpdateSchema);

const doctorListQuery = Joi.object({
  search: Joi.string().trim().max(255).allow("").optional(),
  active: Joi.boolean().optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveDoctorList = validate("query", doctorListQuery);

// ── Appointments ──
const appointmentListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  status: Joi.string().valid(...BIRTHWAVE_APPOINTMENT_STATUSES).allow("").optional(),
  doctor_id: Joi.number().integer().positive().optional(),
  lead_id: Joi.number().integer().positive().optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveAppointmentList = validate("query", appointmentListQuery);

const appointmentCreateSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  doctor_id: Joi.number().integer().positive().allow(null).optional(),
  service: nullableText(255),
  scheduled_at: Joi.date().iso().required(),
  status: Joi.string().valid(...BIRTHWAVE_APPOINTMENT_STATUSES).optional(),
  notes: nullableText(5000),
}).unknown(false);
export const validateBirthwaveAppointmentCreate = validate("body", appointmentCreateSchema);

const appointmentUpdateSchema = appointmentCreateSchema
  .keys({
    continuation: Joi.object({
      type: Joi.string().valid("FOLLOW_UP", "RETRY_CALL", "LOST").required(),
      due_at: Joi.date().iso().optional(),
      reason: Joi.string().trim().max(500).allow("", null).optional(),
      lost_reason: Joi.string().trim().max(100).allow("", null).optional(),
    }).optional(),
  })
  .fork(["lead_id", "scheduled_at"], (s) => s.optional())
  .min(1);
export const validateBirthwaveAppointmentUpdate = validate("body", appointmentUpdateSchema);

// ── Website / landing-page leads ──
const websiteLeadListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  source_key: Joi.string().valid(...BIRTHWAVE_WEBSITE_SOURCE_KEYS).allow("").optional(),
  status: Joi.string().valid(...BIRTHWAVE_WEBSITE_LEAD_STATUSES).allow("").optional(),
  sheet_sync_status: Joi.string().valid("pending", "synced", "failed").allow("").optional(),
  search: Joi.string().trim().max(255).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveWebsiteLeadList = validate("query", websiteLeadListQuery);

const websiteLeadUpdateSchema = Joi.object({
  status: Joi.string().valid(...BIRTHWAVE_WEBSITE_LEAD_STATUSES).optional(),
  notes: Joi.string().trim().max(5000).allow(null, "").optional(),
}).min(1).unknown(false);
export const validateBirthwaveWebsiteLeadUpdate = validate("body", websiteLeadUpdateSchema);

// Public intake — permissive; the service does the strict checks.
export const validateBirthwaveWebsiteLeadPublic = validate("body", Joi.object().unknown(true));

// ── BW-SVC-001: Birthwave service master ────────────────────────────────────
const serviceListQuery = Joi.object({
  active: Joi.boolean().optional(),
  search: Joi.string().trim().max(160).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveServiceList = validate("query", serviceListQuery);

// `is_system` is deliberately absent: only the seed migration may create a
// system service, so a tenant cannot mint an undeletable one through the API.
const serviceCreateSchema = Joi.object({
  name: Joi.string().trim().max(160).required(),
  slug: Joi.string().trim().max(160).optional(),
  is_active: Joi.boolean().optional(),
  sort_order: Joi.number().integer().min(0).max(100000).optional(),
}).unknown(false);
export const validateBirthwaveServiceCreate = validate("body", serviceCreateSchema);
export const validateBirthwaveServiceUpdate = validate(
  "body",
  serviceCreateSchema.fork(["name"], (s) => s.optional()).min(1),
);

const serviceReorderSchema = Joi.object({
  order: Joi.array().items(Joi.number().integer().positive()).min(1).max(200).required(),
}).unknown(false);
export const validateBirthwaveServiceReorder = validate("body", serviceReorderSchema);
