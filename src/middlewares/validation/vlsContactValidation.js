import Joi from "joi";

const vlsContactSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().optional().allow(null, ""),
  mobile: Joi.string().trim().optional().allow(null, ""),
  Number: Joi.string().trim().optional().allow(null, ""),
  message: Joi.string().trim().optional().allow(null, ""),
  comment: Joi.string().trim().optional().allow(null, ""),
  ip_address: Joi.string().optional().allow(null, ""),
  utm_source: Joi.string().optional().allow(null, ""),

  _client_key: Joi.string().optional().allow(null, ""),
  client_key: Joi.string().optional().allow(null, ""),
});

export const validateVlsContact = (req, res, next) => {
  const { error, value } = vlsContactSchema.validate(req.body, {
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
