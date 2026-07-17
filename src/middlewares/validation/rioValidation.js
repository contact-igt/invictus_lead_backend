import Joi from "joi";

export const RIO_BRANCHES = [
  "Madurai (Main)",
  "Southwing, Madurai",
  "Dindigul",
  "Thanjavur",
];

export const RIO_SERVICES = [
  "High-Risk Pregnancy Care",
  "Fetal Medicine",
  "NICU",
  "PICU",
  "Paediatric Emergency Care",
  "General Paediatrics",
  "Paediatric Super Specialities",
  "Vaccination Services",
  "Human Milk Bank",
  "Maternity Care",
  "Fertility & IVF",
  "General Enquiry",
];

const optionalText = (max) =>
  Joi.string().trim().max(max).allow(null, "").optional();
const optionalService = Joi.string()
  .trim()
  .valid(...RIO_SERVICES)
  .allow(null, "")
  .optional();
const optionalBranch = Joi.string()
  .trim()
  .valid(...RIO_BRANCHES)
  .allow(null, "")
  .optional();

const createFields = {
  name: Joi.string().trim().max(150).required(),
  mobile_number: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .required(),
  service: optionalService,
  branch: optionalBranch,
  message: optionalText(2000),
  ip_address: optionalText(45),
  utm_source: optionalText(255),
};

export const rioCreateSchema = Joi.object(createFields).unknown(false);
export const rioPublicCreateSchema = rioCreateSchema.keys({
  client_key: Joi.string().trim().lowercase().max(100).optional(),
});
export const rioUpdateSchema = Joi.object({
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
export const rioIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);
export const rioListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: Joi.string()
    .trim()
    .valid(...RIO_SERVICES)
    .allow("")
    .optional(),
  branch: Joi.string()
    .trim()
    .valid(...RIO_BRANCHES)
    .allow("")
    .optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);
export const rioExportSchema = rioListSchema.keys({
  format: Joi.string().valid("csv", "pdf").required(),
});
const rioContextSchema = Joi.object({
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

const validate = (source, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    convert: true,
  });
  if (error)
    return res
      .status(400)
      .json({
        success: false,
        message: "Validation error",
        details: error.details.map((detail) => detail.message),
      });
  if (source === "query")
    Object.defineProperty(req, "query", {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  else req[source] = value;
  next();
};

export const validateRioCreate = validate("body", rioCreateSchema);
export const validateRioPublicCreate = validate("body", rioPublicCreateSchema);
export const validateRioUpdate = validate("body", rioUpdateSchema);
export const validateRioId = validate("params", rioIdSchema);
export const validateRioList = validate("query", rioListSchema);
export const validateRioExport = validate("query", rioExportSchema);
export const validateRioContext = validate("query", rioContextSchema);
