import Joi from "joi";

export const PIXEL_EYE_WEBSITE_LEAD_SERVICES = [
  "Cataract",
  "Lasik",
  "Squint",
  "Retina",
  "Glaucoma",
  "Keratoconus",
  "Pediatric",
];

const optionalText = (max) =>
  Joi.string().trim().max(max).allow(null, "").optional();

const optionalService = Joi.string()
  .trim()
  .valid(...PIXEL_EYE_WEBSITE_LEAD_SERVICES)
  .allow(null, "")
  .optional();

export const pixelEyeWebsiteLeadCreateSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  mobile_number: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .required(),
  service: optionalService,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
}).unknown(false);

export const pixelEyeWebsiteLeadPublicCreateSchema = pixelEyeWebsiteLeadCreateSchema.keys({
  client_key: Joi.string().trim().lowercase().max(100).optional(),
});

export const pixelEyeWebsiteLeadUpdateSchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  mobile_number: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[0-9+\-()\s]+$/)
    .optional(),
  service: optionalService,
  ip_address: optionalText(45),
  utm_source: optionalText(255),
})
  .min(1)
  .unknown(false);

export const pixelEyeWebsiteLeadIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

export const pixelEyeWebsiteLeadListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: Joi.string().trim().valid(...PIXEL_EYE_WEBSITE_LEAD_SERVICES).allow("").optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

export const pixelEyeWebsiteLeadExportSchema = Joi.object({
  format: Joi.string().valid("csv", "pdf").required(),
  search: Joi.string().trim().max(255).allow("").optional(),
  service: Joi.string().trim().valid(...PIXEL_EYE_WEBSITE_LEAD_SERVICES).allow("").optional(),
  utm_source: Joi.string().trim().max(255).allow("").optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional(),
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

const pixelEyeWebsiteLeadContextSchema = Joi.object({
  _client_key: Joi.string().trim().lowercase().max(100).optional(),
}).unknown(false);

const validate = (source, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    convert: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((detail) => detail.message),
    });
  }

  if (source === "query") {
    Object.defineProperty(req, "query", {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    req[source] = value;
  }

  next();
};

export const validatePixelEyeWebsiteLeadCreate = validate(
  "body",
  pixelEyeWebsiteLeadCreateSchema,
);
export const validatePixelEyeWebsiteLeadPublicCreate = validate(
  "body",
  pixelEyeWebsiteLeadPublicCreateSchema,
);
export const validatePixelEyeWebsiteLeadUpdate = validate(
  "body",
  pixelEyeWebsiteLeadUpdateSchema,
);
export const validatePixelEyeWebsiteLeadId = validate(
  "params",
  pixelEyeWebsiteLeadIdSchema,
);
export const validatePixelEyeWebsiteLeadList = validate(
  "query",
  pixelEyeWebsiteLeadListSchema,
);
export const validatePixelEyeWebsiteLeadExport = validate(
  "query",
  pixelEyeWebsiteLeadExportSchema,
);
export const validatePixelEyeWebsiteLeadContext = validate(
  "query",
  pixelEyeWebsiteLeadContextSchema,
);


