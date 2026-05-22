import Joi from "joi";

const propertyLawRegistrationSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().required(),
  mobile: Joi.string().trim().required(),

  // Accept camelCase from landing page
  yearsOfPractice: Joi.string().trim().optional().allow(null, ""),
  // Accept snake_case too (admin/test clients)
  years_of_practice: Joi.string().trim().optional().allow(null, ""),

  amount: Joi.number().optional().allow(null),
  programm_date: Joi.date().iso().optional().allow(null, ""),

  razorpay_order_id: Joi.string().optional().allow(null, ""),
  razorpay_payment_id: Joi.string().optional().allow(null, ""),
  razorpay_signature: Joi.string().optional().allow(null, ""),

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

  // Admin panel passes _client_key so super-admin can resolve client_id
  _client_key: Joi.string().optional().allow(null, ""),
  client_key: Joi.string().optional().allow(null, ""),
});

export const validatePropertyLawRegistration = (req, res, next) => {
  const { error, value } = propertyLawRegistrationSchema.validate(req.body, {
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
