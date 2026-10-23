import Joi from "joi";

export const PIXEL_EYE_WEBSITE_LEAD_SERVICES = [
  "Cataract",
  "Lasik",
  "Squint",
  "Retina",
  "Glaucoma",
  "Keratoconus",
  "Pediatric",
];

// Landing pages that mirror to their own Google Sheet (see pixelEyeSheetSync.service.js).
export const PIXEL_EYE_WEBSITE_LEAD_SOURCE_KEYS = [
  "cataract",
  "lasik",
  "keratoconus",
  "squint",
  "sanathnagar",
  "retina",
  "pediatric",
  "registration",
  "glaucoma",
];

const APPOINTMENT_LOCATIONS = ["Sanath Nagar", "Kukatpally"];
const APPOINTMENT_SYMPTOMS = [
  "Eye redness or irritation",
  "Dry, burning, or gritty eyes",
  "Blurred or reduced vision",
  "Eye pain or headache around the eyes",
  "Watering, discharge, or itching",
  "Floaters, flashes, or spots in vision",
  "Difficulty seeing at night or glare from lights",
  "Squint or eyes not aligned",
  "Child's eye or vision concern",
  "Eyelid swelling, drooping, or lump",
  "Glasses or contact lens power concern",
  "Routine eye check-up",
  "Other eye concern",
];

const APPOINTMENT_TIME_SLOTS = [
  "09:00 AM - 10:00 AM", "10:00 AM - 11:00 AM", "11:00 AM - 12:00 PM",
  "12:00 PM - 01:00 PM", "01:00 PM - 02:00 PM", "02:00 PM - 03:00 PM",
  "03:00 PM - 04:00 PM", "04:00 PM - 05:00 PM", "05:00 PM - 06:00 PM",
  "06:00 PM - 07:00 PM", "07:00 PM - 08:00 PM",
];

const optionalText = (max) =>
  Joi.string().trim().max(max).allow(null, "").optional();

const optionalService = Joi.string()
  .trim()
  .valid(...PIXEL_EYE_WEBSITE_LEAD_SERVICES)
  .allow(null, "")
  .optional();

export const pixelEyeWebsiteLeadCreateSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  mobile_number: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .required(),
  service: optionalService,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
  source_key: Joi.string().trim().lowercase().valid(...PIXEL_EYE_WEBSITE_LEAD_SOURCE_KEYS).allow(null, "").optional(),
}).unknown(false);

export const pixelEyeWebsiteLeadPublicCreateSchema = pixelEyeWebsiteLeadCreateSchema.keys({
  client_key: Joi.string().trim().lowercase().max(100).optional(),
});

export const pixelEyeWebsiteAppointmentCreateSchema = Joi.object({
  form_name: Joi.string().valid("Appointments").required(),
  lead_type: Joi.string().valid("appointment_enquiry").required(),
  // The PixelEye website relay obtains this on the server from trusted proxy
  // headers. Keep it top-level so the relay contract is explicit.
  ip_address: Joi.string().trim().ip({ version: ["ipv4", "ipv6"], cidr: "forbidden" }).allow("", null).optional(),
  data: Joi.object({
    fullName: Joi.string().trim().pattern(/^[a-zA-Z ]+$/).max(150).required(),
    email: Joi.string().trim().email().allow("", null).optional(),
    countryCode: Joi.string().trim().valid("+91", "+1", "+44", "+971").default("+91"),
    mobile: Joi.string().trim().pattern(/^\d{10}$/).required(),
    location: Joi.string().valid(...APPOINTMENT_LOCATIONS).required(),
    date: Joi.date().iso().required(),
    symptoms: Joi.string().valid(...APPOINTMENT_SYMPTOMS).required(),
    symptomDetails: Joi.string().trim().max(4000).allow("", null).optional(),
    timeSlot: Joi.string().valid(...APPOINTMENT_TIME_SLOTS).required(),
    terms: Joi.boolean().valid(true).required(),
    whatsapp: Joi.boolean().default(false),
    consent: Joi.boolean().default(false),
  }).required(),
  attribution: Joi.object({
    // Backward-compatible while website deployments move to the top-level field.
    ip_address: Joi.string().trim().ip({ version: ["ipv4", "ipv6"], cidr: "forbidden" }).allow("", null).optional(),
    source_page_url: Joi.string().trim().uri().max(2048).allow("", null).optional(),
    referrer_url: Joi.string().trim().uri().max(2048).allow("", null).optional(),
    utm_source: Joi.string().trim().max(255).allow("", null).optional(),
    utm_medium: Joi.string().trim().max(255).allow("", null).optional(),
    utm_campaign: Joi.string().trim().max(255).allow("", null).optional(),
    utm_term: Joi.string().trim().max(255).allow("", null).optional(),
    utm_content: Joi.string().trim().max(255).allow("", null).optional(),
  }).default({}),
}).unknown(false);

export const pixelEyeWebsiteLeadUpdateSchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  mobile_number: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .optional(),
  service: optionalService,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
})
  .min(1)
  .unknown(false);

export const pixelEyeWebsiteLeadIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

export const pixelEyeWebsiteLeadListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: Joi.string().trim().valid(...PIXEL_EYE_WEBSITE_LEAD_SERVICES).allow("").optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const pixelEyeWebsiteLeadExportSchema = Joi.object({
  format: Joi.string().valid("csv", "pdf").required(),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: Joi.string().trim().valid(...PIXEL_EYE_WEBSITE_LEAD_SERVICES).allow("").optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

const pixelEyeWebsiteLeadContextSchema = pixelEyeWebsiteLeadListSchema
  .fork(["page", "limit"], (schema) => schema.optional());

const validate = (source, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    convert: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((detail) => detail.message),
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

export const validatePixelEyeWebsiteLeadCreate = validate(
  "body",
  pixelEyeWebsiteLeadCreateSchema,
);
export const validatePixelEyeWebsiteLeadPublicCreate = validate(
  "body",
  pixelEyeWebsiteLeadPublicCreateSchema,
);
export const validatePixelEyeWebsiteAppointmentCreate = validate(
  "body",
  pixelEyeWebsiteAppointmentCreateSchema,
);
export const validatePixelEyeWebsiteLeadUpdate = validate(
  "body",
  pixelEyeWebsiteLeadUpdateSchema,
);
export const validatePixelEyeWebsiteLeadId = validate(
  "params",
  pixelEyeWebsiteLeadIdSchema,
);
export const validatePixelEyeWebsiteLeadList = validate(
  "query",
  pixelEyeWebsiteLeadListSchema,
);
export const validatePixelEyeWebsiteLeadExport = validate(
  "query",
  pixelEyeWebsiteLeadExportSchema,
);
export const validatePixelEyeWebsiteLeadContext = validate(
  "query",
  pixelEyeWebsiteLeadContextSchema,
);


