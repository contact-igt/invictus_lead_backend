import Joi from "joi";

const vlsCourseDetailsSchema = Joi.object({
  name: Joi.string().trim().required(),
  Name: Joi.string().trim().optional().allow(null, ""),
  email: Joi.string().email().lowercase().optional().allow(null, ""),
  Email: Joi.string().email().lowercase().optional().allow(null, ""),
  mobile: Joi.string().trim().optional().allow(null, ""),
  Number: Joi.string().trim().optional().allow(null, ""),
  course: Joi.string().trim().required(),
  Course: Joi.string().trim().optional().allow(null, ""),

  // "register_now" (Enroll Now / inline Register Now) or "download_syllabus".
  submission_type: Joi.string().valid("register_now", "download_syllabus").required(),

  call_time: Joi.string().trim().optional().allow(null, ""),
  CallTime: Joi.string().trim().optional().allow(null, ""),
  class_mode: Joi.string().trim().optional().allow(null, ""),
  ClassMode: Joi.string().trim().optional().allow(null, ""),

  ip_address: Joi.string().optional().allow(null, ""),
  utm_source: Joi.string().optional().allow(null, ""),

  _client_key: Joi.string().optional().allow(null, ""),
  client_key: Joi.string().optional().allow(null, ""),
}).unknown(false);

export const validateVlsCourseDetails = (req, res, next) => {
  const { error, value } = vlsCourseDetailsSchema.validate(req.body, {
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
