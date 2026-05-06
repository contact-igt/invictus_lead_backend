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
    .valid("paid", "failed", "attempted", "cancelled")
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
    .required(),
  captured: Joi.boolean().default(true),
  razorpay_order_id: Joi.string().optional().allow(null, ""),
  razorpay_payment_id: Joi.string().optional().allow(null, ""),
  razorpay_signature: Joi.string().optional().allow(null, ""),
});

const schemas = {
  vlslaw_practice: vlsLawPracticeSchema,
  vlslaw_academy: vlsLawAcademySchema,
  vlslaw_aibe: vlsLawAibeSchema,
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
