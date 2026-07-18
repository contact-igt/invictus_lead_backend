import Joi from "joi";

const optionalText = (max) =>
  Joi.string().trim().max(max).allow(null, "").optional();

export const PHOENIX_FITNESS_BRANCHES = [
  "Budegere Cross",
  "Kannamangala",
  "Nallurhalli",
  "Yello Living (ITPL)",
  "Hope Farm",
];

const optionalBranch = Joi.string()
  .trim()
  .valid(...PHOENIX_FITNESS_BRANCHES)
  .allow(null, "")
  .optional();

const createFields = {
  name: Joi.string().trim().max(150).required(),
  mobile_number: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .required(),
  branch: optionalBranch,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
};

export const phoenixFitnessCreateSchema = Joi.object(createFields).unknown(false);
export const phoenixFitnessPublicCreateSchema = phoenixFitnessCreateSchema.keys({
  client_key: Joi.string().trim().lowercase().max(100).optional(),
});
export const phoenixFitnessUpdateSchema = Joi.object({
  ...createFields,
  name: Joi.string().trim().max(150).optional(),
  mobile_number: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .optional(),
})
  .min(1)
  .unknown(false);
export const phoenixFitnessIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);
export const phoenixFitnessListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow("").optional(),
  branch: Joi.string()
    .trim()
    .valid(...PHOENIX_FITNESS_BRANCHES)
    .allow("")
    .optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);
export const phoenixFitnessExportSchema = phoenixFitnessListSchema.keys({
  format: Joi.string().valid("csv", "pdf").required(),
});
const phoenixFitnessContextSchema = phoenixFitnessListSchema
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
  } else req[source] = value;
  next();
};

export const validatePhoenixFitnessCreate = validate("body", phoenixFitnessCreateSchema);
export const validatePhoenixFitnessPublicCreate = validate("body", phoenixFitnessPublicCreateSchema);
export const validatePhoenixFitnessUpdate = validate("body", phoenixFitnessUpdateSchema);
export const validatePhoenixFitnessId = validate("params", phoenixFitnessIdSchema);
export const validatePhoenixFitnessList = validate("query", phoenixFitnessListSchema);
export const validatePhoenixFitnessExport = validate("query", phoenixFitnessExportSchema);
export const validatePhoenixFitnessContext = validate("query", phoenixFitnessContextSchema);