import Joi from "joi";

const baseVlsLawSchema = {
  name: Joi.string().trim().required(),
  mobile: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  ip_address: Joi.string().ip().optional().allow(null, ""),
  utm_source: Joi.string().trim().optional().allow(null, ""),
  registered_date: Joi.date().iso().required(),
};

export const vlsLawPracticeSchema = Joi.object({
  ...baseVlsLawSchema,
  amount: Joi.string().trim().optional().allow(null, ""),
  programm_date: Joi.date().iso().required(),
  page_name: Joi.string()
    .valid("decoding-of-practice", "decoding-of-law-practice")
    .required(),
  payment_status: Joi.string()
    .valid("paid", "failed", "attempted", "cancelled", "authorized")
    .required(),
  captured: Joi.boolean().default(true),
  razorpay_order_id: Joi.string().optional().allow(null, ""),
  razorpay_payment_id: Joi.string().optional().allow(null, ""),
  razorpay_signature: Joi.string().optional().allow(null, ""),
});

export const vlsLawAcademySchema = Joi.object({
  ...baseVlsLawSchema,
  message: Joi.string().trim().optional().allow(null, ""),
});

export const vlsLawAibeSchema = Joi.object({
  ...baseVlsLawSchema,
  amount: Joi.string().trim().optional().allow(null, ""),
  programm_start_date: Joi.date().iso().required(),
  programm_end_date: Joi.date().iso().required(),
  payment_status: Joi.string()
    .valid("paid", "failed", "attempted", "cancelled")
    .optional()
    .allow(null, ""),
  captured: Joi.boolean().default(true),
  razorpay_order_id: Joi.string().optional().allow(null, ""),
  razorpay_payment_id: Joi.string().optional().allow(null, ""),
  razorpay_signature: Joi.string().optional().allow(null, ""),
});

export const vlsLawPropertySchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().trim().required(),
  years_of_practice: Joi.string().trim().optional().allow(null, ""),
  amount: Joi.number().optional().allow(null),
  programm_date: Joi.date().iso().optional().allow(null, ""),
  registered_date: Joi.date().iso().optional().allow(null, ""),
  payment_status: Joi.string()
    .valid("paid", "failed", "attempted", "cancelled")
    .required(),
  page_name: Joi.string().trim().optional().allow(null, ""),
  ip_address: Joi.string().optional().allow(null, ""),
  utm_source: Joi.string().optional().allow(null, ""),
  utm_medium: Joi.string().optional().allow(null, ""),
  utm_campaign: Joi.string().optional().allow(null, ""),
  utm_term: Joi.string().optional().allow(null, ""),
  utm_content: Joi.string().optional().allow(null, ""),
  razorpay_order_id: Joi.string().optional().allow(null, ""),
  razorpay_payment_id: Joi.string().optional().allow(null, ""),
  razorpay_signature: Joi.string().optional().allow(null, ""),
});

export const vlsLawFamilySchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().trim().required(),
  years_of_practice: Joi.string().trim().optional().allow(null, ""),
  amount: Joi.number().optional().allow(null),
  programm_date: Joi.date().iso().optional().allow(null, ""),
  registered_date: Joi.date().iso().optional().allow(null, ""),
  payment_status: Joi.string()
    .valid("paid", "failed", "attempted", "cancelled")
    .required(),
  page_name: Joi.string().trim().optional().allow(null, ""),
  ip_address: Joi.string().optional().allow(null, ""),
  utm_source: Joi.string().optional().allow(null, ""),
  utm_medium: Joi.string().optional().allow(null, ""),
  utm_campaign: Joi.string().optional().allow(null, ""),
  utm_term: Joi.string().optional().allow(null, ""),
  utm_content: Joi.string().optional().allow(null, ""),
  razorpay_order_id: Joi.string().optional().allow(null, ""),
  razorpay_payment_id: Joi.string().optional().allow(null, ""),
  razorpay_signature: Joi.string().optional().allow(null, ""),
  _client_key: Joi.string().optional().allow(null, ""),
  client_key: Joi.string().optional().allow(null, ""),
});

const schemas = {
  vlslaw_practice: vlsLawPracticeSchema,
  vlslaw_academy: vlsLawAcademySchema,
  vlslaw_aibe: vlsLawAibeSchema,
  vlslaw_property: vlsLawPropertySchema,
  vlslaw_family: vlsLawFamilySchema,
};

const getSchemaForRequest = (schema, method) => {
  if (method !== "PATCH") {
    return schema;
  }

  const keys = Object.keys(schema.describe().keys || {});
  return schema.fork(keys, (field) => field.optional()).min(1);
};

export const validateDynamicRecord = (req, res, next) => {
  const modelKey = req.params.model.toLowerCase();
  const baseSchema = schemas[modelKey];

  if (!baseSchema) {
    return res
      .status(404)
      .json({ message: `No validation schema found for model '${modelKey}'` });
  }

  const schema = getSchemaForRequest(baseSchema, req.method);

  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      message: "Validation error",
      details: error.details.map((d) => d.message),
    });
  }

  req.body = value;
  next();
};
