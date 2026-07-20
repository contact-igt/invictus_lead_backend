import Joi from "joi";

const AARAV_EYE_CARE_SERVICES = [
  // "General Ophthalmology",
  // "Pediatric Ophthalmology",
  // "Retina Eye Care",
  // "Glaucoma Services",
  // "Neuro Ophthalmology",
  // "LASIK - Specs Removal",
  // "SMILE - Specs Removal",
  // "ICL - Specs Removal",
  // "Cataract Surgery",
  // "Oculoplasty Treatment",

  "General Ophthalmology",
  "Pediatric Ophthalmology",
  "Retina Eye Care",
  "Glaucoma Services",
  "Neuro Ophthalmology",
  "Lasik - Specs Removal",
  "SMILE - Specs Removal",
  "ICL - Specs Removal",
  "Cataract Surgery",
  "Oculoplasty Treatment"
];

const optionalText = (max) =>
  Joi.string().trim().max(max).allow(null, "").optional();

const optionalService = Joi.string()
  .trim()
  .valid(...AARAV_EYE_CARE_SERVICES)
  .allow(null, "")
  .optional();

export const aaravEyeCareCreateSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  mobile_number: Joi.string().trim().max(20).pattern(/^[0-9+\-()\s]+$/).required(),
  service: optionalService,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
}).unknown(false);

export const aaravEyeCarePublicCreateSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  mobile_number: Joi.string().trim().max(20).pattern(/^[0-9+\-()\s]+$/).required(),
  service: optionalService,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
  client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const aaravEyeCareUpdateSchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  mobile_number: Joi.string().trim().max(20).pattern(/^[0-9+\-()\s]+$/).optional(),
  service: optionalService,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
})
  .min(1)
  .unknown(false);

export const aaravEyeCareIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

export const aaravEyeCareListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: Joi.string().trim().max(255).allow("").optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const aaravEyeCareExportSchema = Joi.object({
  format: Joi.string().valid("csv", "pdf").required(),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: Joi.string().trim().max(255).allow("").optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

const aaravEyeCareContextSchema = aaravEyeCareListSchema
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

export const validateAaravEyeCareCreate = validate(
  "body",
  aaravEyeCareCreateSchema,
);
export const validateAaravEyeCarePublicCreate = validate(
  "body",
  aaravEyeCarePublicCreateSchema,
);
export const validateAaravEyeCareUpdate = validate(
  "body",
  aaravEyeCareUpdateSchema,
);
export const validateAaravEyeCareId = validate("params", aaravEyeCareIdSchema);
export const validateAaravEyeCareList = validate(
  "query",
  aaravEyeCareListSchema,
);
export const validateAaravEyeCareExport = validate(
  "query",
  aaravEyeCareExportSchema,
);
export const validateAaravEyeCareContext = validate(
  "query",
  aaravEyeCareContextSchema,
);
