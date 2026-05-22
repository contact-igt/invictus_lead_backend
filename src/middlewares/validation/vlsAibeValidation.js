import Joi from "joi";

const vlsAibeRegistrationSchema = Joi.object({
  name: Joi.string().trim().required(),
  mobile: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().required(),

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

  ip_address: Joi.string().optional().allow(null, ""),
  utm_source: Joi.string().optional().allow(null, ""),

  // Admin may pass _client_key to create for another client
  _client_key: Joi.string().optional().allow(null, ""),
  client_key: Joi.string().optional().allow(null, ""),
});

export const validateVlsAibeRegistration = (req, res, next) => {
  const { error, value } = vlsAibeRegistrationSchema.validate(req.body, {
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
