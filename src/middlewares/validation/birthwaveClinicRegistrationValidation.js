import Joi from "joi";

const optionalText = (max) => Joi.string().trim().max(max).allow(null, "").optional();
const phone = Joi.string().trim().pattern(/^\+91[6-9]\d{9}$/);

export const CONCERNS = [
  "pregnancy", "fertility", "gynaecology", "paediatrics", "vbac", "vaginismus", "not_sure",
];
export const SOURCES = [
  "doctor", "google_maps", "google_search", "friends_family",
  "chatgpt", "instagram", "facebook", "youtube", "other",
];

export const intakeSchema = Joi.object({
  event: Joi.string().valid("clinic_registration.created").required(),
  reference: Joi.string().trim().pattern(/^[A-Za-z0-9_-]{4,40}$/).required(),
  clinicId: Joi.string().trim().max(40).allow(null, "").optional(),
  clinicDate: Joi.date().iso().allow(null).optional(),
  session: Joi.string().valid("morning", "evening").allow(null, "").optional(),
  registeredAt: Joi.date().iso().allow(null).optional(),
  lead: Joi.object({
    source: Joi.string().valid("clinic_registration").required(),
    category: optionalText(80),
    name: Joi.string().trim().min(1).max(150).required(),
    phone: phone.required(),
    alternatePhone: phone.allow(null, "").optional(),
    email: Joi.string().trim().max(254).email({ tlds: false }).allow(null, "").optional(),
    dateOfBirth: Joi.date().iso().allow(null).optional(),
    gender: Joi.string().valid("male", "female").allow(null, "").optional(),
    address: Joi.object({
      line1: optionalText(255),
      line2: optionalText(255),
      city: optionalText(100),
      state: optionalText(100),
      pin: Joi.string().trim().pattern(/^[1-9]\d{5}$/).allow(null, "").optional(),
    }).optional(),
    concerns: Joi.array().items(Joi.string().valid(...CONCERNS)).max(10).default([]),
    sources: Joi.array().items(Joi.string().valid(...SOURCES)).max(10).default([]),
    sourceOther: optionalText(255),
    guardianReviewRequired: Joi.boolean().default(false),
    consent: Joi.boolean().required(),
  }).required(),
}).unknown(false);

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
};

export const validateIntake = validate(intakeSchema);
