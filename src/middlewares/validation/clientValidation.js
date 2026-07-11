import Joi from "joi";
import {
  normalizeClientKey,
  isSupportedClientKey,
  SUPPORTED_CLIENT_MODULES,
} from "../../utils/clientKey.js";

const clientKeySchema = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z0-9_]+$/)
  .custom((value, helpers) => {
    const normalized = normalizeClientKey(value);
    if (!isSupportedClientKey(normalized)) {
      return helpers.error("any.invalid");
    }
    return normalized;
  })
  .messages({
    "string.empty": "client_key is required",
    "string.pattern.base":
      "client_key must contain only lowercase letters, numbers, and underscores",
    "any.invalid": `client_key must start with one of: ${SUPPORTED_CLIENT_MODULES.join(
      ", ",
    )}`,
  });

export const createClientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  client_key: clientKeySchema.required(),
});

export const updateClientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  client_key: clientKeySchema.optional(),
}).min(1).unknown(false);

const runValidation = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res
      .status(400)
      .json({ message: "Validation error", details: error.details });
  }

  req.body = value;
  next();
};

export const validateCreateClient = (req, res, next) =>
  runValidation(createClientSchema, req, res, next);

export const validateUpdateClient = (req, res, next) =>
  runValidation(updateClientSchema, req, res, next);
export const clientIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

export const validateClientId = (req, res, next) => {
  const { error, value } = clientIdSchema.validate(req.params, { abortEarly: false, convert: true });
  if (error) {
    return res.status(400).json({ message: "Validation error", details: error.details.map((d) => d.message) });
  }
  req.params = value;
  next();
};
