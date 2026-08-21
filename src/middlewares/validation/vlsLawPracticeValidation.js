import Joi from "joi";

const optionalText = (max) => Joi.string().trim().max(max).allow(null, "").optional();
const optionalDate = Joi.string().trim().max(100).allow(null, "").optional();

const amountSchema = Joi.number().min(0).precision(2).allow(null, "").optional();
const capturedSchema = Joi.boolean().allow(null, "").optional();
const pageNameSchema = Joi.string()
  .trim()
  .valid("decoding-of-practice", "decoding-of-law-practice");
const paymentStatusSchema = Joi.string()
  .trim()
  .max(50)
  .valid("paid", "attempted", "failed", "cancelled", "authorized", "waitlist")
  .allow(null, "")
  .optional();

const editableFields = {
  name: Joi.string().trim().max(150).required(),
  mobile: Joi.string().trim().max(20).pattern(/^[0-9+\-()\s]+$/).required(),
  email: Joi.string().trim().email().max(255).allow(null, "").optional(),
  amount: amountSchema,
  registered_date: optionalDate,
  programm_date: optionalDate,
  payment_status: paymentStatusSchema,
  captured: capturedSchema,
  page_name: pageNameSchema.required(),
  ip_address: optionalText(45),
  utm_source: optionalText(255),
};

export const vlsLawPracticeCreateSchema = Joi.object(editableFields).unknown(false);

export const vlsLawPracticePublicCreateSchema = Joi.object({
  ...editableFields,
  client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(true);

export const vlsLawPracticeUpdateSchema = Joi.object({
  ...editableFields,
  name: Joi.string().trim().max(150).optional(),
  mobile: Joi.string().trim().max(20).pattern(/^[0-9+\-()\s]+$/).optional(),
  page_name: pageNameSchema.optional(),
})
  .min(1)
  .unknown(false);

export const vlsLawPracticeIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

export const vlsLawPracticeListSchema = Joi.object({
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

export const vlsLawPracticeExportSchema = vlsLawPracticeListSchema.keys({
  format: Joi.string().valid("csv", "pdf").required(),
}).fork(["page", "limit"], (schema) => schema.optional());

export const vlsLawPracticeContextSchema = vlsLawPracticeListSchema
  .fork(["page", "limit"], (schema) => schema.optional());

const validate = (source, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    convert: true,
    stripUnknown: true,
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

export const validateVlsLawPracticeCreate = validate("body", vlsLawPracticeCreateSchema);
export const validateVlsLawPracticePublicCreate = validate(
  "body",
  vlsLawPracticePublicCreateSchema,
);
export const validateVlsLawPracticeUpdate = validate("body", vlsLawPracticeUpdateSchema);
export const validateVlsLawPracticeId = validate("params", vlsLawPracticeIdSchema);
export const validateVlsLawPracticeList = validate("query", vlsLawPracticeListSchema);
export const validateVlsLawPracticeExport = validate("query", vlsLawPracticeExportSchema);
export const validateVlsLawPracticeContext = validate("query", vlsLawPracticeContextSchema);
