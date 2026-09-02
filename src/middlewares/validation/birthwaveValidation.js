import Joi from "joi";
import { BIRTHWAVE_LEAD_STATUSES, BIRTHWAVE_LEAD_SOURCES } from "../../database/tables/BirthwaveLeadTable/index.js";
import { BIRTHWAVE_APPOINTMENT_STATUSES } from "../../database/tables/BirthwaveAppointmentTable/index.js";
import {
  BIRTHWAVE_WEBSITE_SOURCE_KEYS,
  BIRTHWAVE_WEBSITE_LEAD_STATUSES,
} from "../../database/tables/BirthwaveWebsiteLeadTable/index.js";

const CLIENT_KEY = Joi.string().trim().lowercase().max(120).optional();
const phone = Joi.string().trim().max(30).pattern(/^[0-9+\-()\s]+$/);
const nullableText = (max) => Joi.string().trim().max(max).allow(null, "").optional();

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

// ── Dashboard ──
const dashboardQuery = Joi.object({
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  source: Joi.string().valid(...BIRTHWAVE_LEAD_SOURCES).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveDashboard = validate("query", dashboardQuery);

// ── Leads ──
const leadListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  search: Joi.string().trim().max(255).allow("").optional(),
  status: Joi.string().valid(...BIRTHWAVE_LEAD_STATUSES).allow("").optional(),
  source: Joi.string().valid(...BIRTHWAVE_LEAD_SOURCES).allow("").optional(),
  assigned_doctor_id: Joi.number().integer().positive().optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  custom_field_key: Joi.string().trim().max(80).optional(),
  custom_field_value: Joi.string().trim().max(255).allow("").optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateBirthwaveLeadList = validate("query", leadListQuery);

const leadCreateSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  phone: phone.required(),
  email: Joi.string().trim().email().max(200).allow(null, "").optional(),
  service: nullableText(255),
  source: Joi.string().valid(...BIRTHWAVE_LEAD_SOURCES).allow(null, "").optional(),
  status: Joi.string().valid(...BIRTHWAVE_LEAD_STATUSES).optional(),
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
