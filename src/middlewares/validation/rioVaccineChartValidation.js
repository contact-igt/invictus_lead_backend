import Joi from "joi";

const optionalText = (max) =>
  Joi.string().trim().max(max).allow(null, "").optional();

const createFields = {
  registration_number: Joi.string()
    .trim()
    .pattern(/^\d{8}$/)
    .required()
    .messages({ "string.pattern.base": "Registration number must be exactly 8 digits" }),
  parent_name: Joi.string().trim().max(150).required(),
  child_name: Joi.string().trim().max(150).required(),
  phone: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .required(),
  dob: Joi.date().iso().required(),
  gender: Joi.string().trim().valid("Male", "Female").allow(null, "").optional(),
  ip_address: optionalText(45),
  utm_source: optionalText(255),
};

export const rioVaccineChartCreateSchema = Joi.object({
  ...createFields,
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);
export const rioVaccineChartPublicCreateSchema = rioVaccineChartCreateSchema.keys({
  client_key: Joi.string().trim().lowercase().max(100).optional(),
});
export const rioVaccineChartUpdateSchema = Joi.object({
  ...createFields,
  registration_number: createFields.registration_number.optional(),
  parent_name: Joi.string().trim().max(150).optional(),
  child_name: Joi.string().trim().max(150).optional(),
  phone: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .optional(),
  dob: Joi.date().iso().optional(),
})
  .min(1)
  .unknown(false);
export const rioVaccineChartIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);
export const rioVaccineChartListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  search: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

const validate = (source, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    convert: true,
  });
  if (error)
    return res
      .status(400)
      .json({
        success: false,
        message: "Validation error",
        details: error.details.map((detail) => detail.message),
      });
  if (source === "query")
    Object.defineProperty(req, "query", {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  else req[source] = value;
  next();
};

export const validateRioVaccineChartCreate = validate("body", rioVaccineChartCreateSchema);
export const validateRioVaccineChartPublicCreate = validate("body", rioVaccineChartPublicCreateSchema);
export const validateRioVaccineChartUpdate = validate("body", rioVaccineChartUpdateSchema);
export const validateRioVaccineChartId = validate("params", rioVaccineChartIdSchema);
export const validateRioVaccineChartList = validate("query", rioVaccineChartListSchema);
