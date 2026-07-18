import Joi from "joi";

const optionalText = (max) =>
  Joi.string().trim().max(max).allow(null, "").optional();

const SHANTI_EYE_TECH_SERVICES = [
  "Cataract",
  "Lasik",
  "Pediatric",
  "Glaucoma",
  "Retina",
];

const optionalService = Joi.string()
  .trim()
  .valid(...SHANTI_EYE_TECH_SERVICES)
  .allow(null, "")
  .optional();

const serviceFilter = Joi.string()
  .trim()
  .valid(...SHANTI_EYE_TECH_SERVICES, "")
  .optional();
const createFields = {
  name: Joi.string().trim().max(150).required(),
  mobile_number: Joi.string().trim().max(20).required(),
  service: optionalService,
  message: optionalText(5000),
  ip_address: optionalText(45),
  utm_source: optionalText(255),
};

export const shantiEyeTechCreateSchema = Joi.object(createFields).unknown(false);

export const shantiEyeTechPublicCreateSchema = Joi.object({
  ...createFields,
  client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const shantiEyeTechUpdateSchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  mobile_number: Joi.string().trim().max(20).optional(),
  service: optionalService,
  message: optionalText(5000),
  ip_address: optionalText(45),
  utm_source: optionalText(255),
})
  .min(1)
  .unknown(false);

export const shantiEyeTechIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

export const shantiEyeTechListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: serviceFilter,
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const shantiEyeTechExportSchema = Joi.object({
  format: Joi.string().valid("csv", "pdf").required(),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: serviceFilter,
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

const shantiEyeTechContextSchema = shantiEyeTechListSchema
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

export const validateShantiEyeTechCreate = validate(
  "body",
  shantiEyeTechCreateSchema,
);
export const validateShantiEyeTechPublicCreate = validate(
  "body",
  shantiEyeTechPublicCreateSchema,
);
export const validateShantiEyeTechUpdate = validate(
  "body",
  shantiEyeTechUpdateSchema,
);
export const validateShantiEyeTechId = validate("params", shantiEyeTechIdSchema);
export const validateShantiEyeTechList = validate(
  "query",
  shantiEyeTechListSchema,
);
export const validateShantiEyeTechExport = validate(
  "query",
  shantiEyeTechExportSchema,
);
export const validateShantiEyeTechContext = validate(
  "query",
  shantiEyeTechContextSchema,
);
