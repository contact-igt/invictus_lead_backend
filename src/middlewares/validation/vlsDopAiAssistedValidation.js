import Joi from "joi";

const vlsDopAiAssistedRegistrationSchema = Joi.object({
  name: Joi.string().trim().optional().allow(null, ""),
  email: Joi.string().email().lowercase().optional().allow(null, ""),
  mobile: Joi.string().trim().required(),

  programm_date: Joi.string().optional().allow(null, ""),
  amount: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null, ""),

  razorpay_order_id: Joi.string().optional().allow(null, ""),
  razorpay_payment_id: Joi.string().optional().allow(null, ""),
  razorpay_signature: Joi.string().optional().allow(null, ""),

  payment_status: Joi.string()
    .valid("paid", "failed", "attempted", "cancelled", "waitlist")
    .optional()
    .default("attempted")
    .allow(null, ""),

  captured: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional().allow(null, ""),
  page_name: Joi.string().trim().optional().allow(null, ""),
  ip_address: Joi.string().optional().allow(null, ""),

  utm_source: Joi.string().optional().allow(null, ""),
  utm_medium: Joi.string().optional().allow(null, ""),
  utm_campaign: Joi.string().optional().allow(null, ""),
  utm_term: Joi.string().optional().allow(null, ""),
  utm_content: Joi.string().optional().allow(null, ""),

  _client_key: Joi.string().optional().allow(null, ""),
  client_key: Joi.string().optional().allow(null, ""),
});

export const validateVlsDopAiAssistedRegistration = (req, res, next) => {
  const { error, value } = vlsDopAiAssistedRegistrationSchema.validate(req.body, {
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
