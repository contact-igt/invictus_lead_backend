import Joi from "joi";

const userSchema = {
  title: Joi.string().valid("Mr", "Ms", "Mrs").required(),
  username: Joi.string().trim().min(3).required(),
  email: Joi.string().email().required(),
  country_code: Joi.string().trim().optional(),
  mobile: Joi.string().trim().required(),
  profile_picture: Joi.string().uri().allow(null, "").optional(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid("super-admin", "admin", "client").required(),
  client_key: Joi.string().trim().optional(),
};

export const createUserSchema = Joi.object(userSchema);

export const updateUserSchema = Joi.object({
  ...userSchema,
  password: Joi.string().min(8).optional(),
  role: Joi.string().valid("super-admin", "admin", "client").optional(),
  title: Joi.string().valid("Mr", "Ms", "Mrs").optional(),
  username: Joi.string().trim().min(3).optional(),
  email: Joi.string().email().optional(),
  mobile: Joi.string().trim().optional(),
}).min(1);

const runValidation = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true, // This automatically helps with mass assignment too!
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

export const validateCreateUser = (req, res, next) =>
  runValidation(createUserSchema, req, res, next);

export const validateUpdateUser = (req, res, next) =>
  runValidation(updateUserSchema, req, res, next);
