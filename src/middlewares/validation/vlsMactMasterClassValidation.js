import Joi from "joi";

const optionalText = (max) => Joi.string().trim().max(max).allow(null, "").optional();
const optionalDate = Joi.date().iso().allow(null, "").optional();

const amountSchema = Joi.number().min(0).precision(2).allow(null, "").optional();
const capturedSchema = Joi.boolean().allow(null, "").optional();

const editableFields = {
  name: Joi.string().trim().max(150).required(),
  mobile: Joi.string().trim().max(20).pattern(/^[0-9+\-()\s]+$/).required(),
  email: Joi.string().trim().email().max(255).allow(null, "").optional(),
  amount: amountSchema,
  registered_date: optionalDate,
  programm_date: optionalDate,
  payment_status: optionalText(50),
  captured: capturedSchema,
  page_name: optionalText(255),
  ip_address: optionalText(45),
  utm_source: optionalText(255),
};

export const vlsMactMasterClassCreateSchema = Joi.object(editableFields).unknown(false);

export const vlsMactMasterClassPublicCreateSchema = Joi.object({
  ...editableFields,
  client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const vlsMactMasterClassUpdateSchema = Joi.object({
  ...editableFields,
  name: Joi.string().trim().max(150).optional(),
  mobile: Joi.string().trim().max(20).pattern(/^[0-9+\-()\s]+$/).optional(),
})
  .min(1)
  .unknown(false);

export const vlsMactMasterClassIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

export const vlsMactMasterClassListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow("").optional(),
  payment_status: Joi.string().trim().max(50).allow("").optional(),
  captured: Joi.boolean().allow("").optional(),
  page_name: Joi.string().trim().max(255).allow("").optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  registered_start_date: Joi.date().iso().optional(),
  registered_end_date: Joi.date().iso().min(Joi.ref("registered_start_date")).optional(),
  programm_start_date: Joi.date().iso().optional(),
  programm_end_date: Joi.date().iso().min(Joi.ref("programm_start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const vlsMactMasterClassExportSchema = vlsMactMasterClassListSchema.keys({
  format: Joi.string().valid("csv", "pdf").required(),
}).fork(["page", "limit"], (schema) => schema.optional());

export const vlsMactMasterClassContextSchema = vlsMactMasterClassListSchema
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

export const validateVlsMactMasterClassCreate = validate("body", vlsMactMasterClassCreateSchema);
export const validateVlsMactMasterClassPublicCreate = validate(
  "body",
  vlsMactMasterClassPublicCreateSchema,
);
export const validateVlsMactMasterClassUpdate = validate("body", vlsMactMasterClassUpdateSchema);
export const validateVlsMactMasterClassId = validate("params", vlsMactMasterClassIdSchema);
export const validateVlsMactMasterClassList = validate("query", vlsMactMasterClassListSchema);
export const validateVlsMactMasterClassExport = validate("query", vlsMactMasterClassExportSchema);
export const validateVlsMactMasterClassContext = validate("query", vlsMactMasterClassContextSchema);
