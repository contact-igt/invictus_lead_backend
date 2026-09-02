import Joi from "joi";
import { CRM_FIELD_TYPES } from "../../database/tables/CrmCustomFieldTable/index.js";
import { CRM_PROVIDERS } from "../../database/tables/CrmIntegrationTable/index.js";

const CLIENT_KEY = Joi.string().trim().lowercase().max(120).optional();

const validate = (source, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    convert: true,
    stripUnknown: source === "query",
  });
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((d) => d.message),
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

const idSchema = Joi.object({ id: Joi.number().integer().positive().required() });
export const validateCrmId = validate("params", idSchema);

const providerParam = Joi.object({
  provider: Joi.string().valid(...CRM_PROVIDERS).required(),
});
export const validateCrmProviderParam = validate("params", providerParam);

const callProviderParam = Joi.object({
  provider: Joi.string().trim().lowercase().max(30).required(),
});
export const validateCrmCallProviderParam = validate("params", callProviderParam);

const fieldsQuery = Joi.object({
  entity_type: Joi.string().trim().max(50).optional(),
  include_archived: Joi.alternatives(Joi.boolean(), Joi.string()).optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateCrmFieldsQuery = validate("query", fieldsQuery);

const optionSchema = Joi.object({
  value: Joi.string().required(),
  label: Joi.string().required(),
});

const fieldCreateSchema = Joi.object({
  entity_type: Joi.string().trim().max(50).optional(),
  field_key: Joi.string().trim().max(80).optional(),
  label: Joi.string().trim().max(150).required(),
  field_type: Joi.string().valid(...CRM_FIELD_TYPES).required(),
  options: Joi.array().items(optionSchema).allow(null).optional(),
  required: Joi.boolean().optional(),
  active: Joi.boolean().optional(),
  show_in_form: Joi.boolean().optional(),
  show_in_detail: Joi.boolean().optional(),
  show_in_table: Joi.boolean().optional(),
  filterable: Joi.boolean().optional(),
  display_order: Joi.number().integer().min(0).optional(),
}).unknown(false);
export const validateCrmFieldCreate = validate("body", fieldCreateSchema);

const fieldUpdateSchema = Joi.object({
  label: Joi.string().trim().max(150).optional(),
  field_type: Joi.string().valid(...CRM_FIELD_TYPES).optional(),
  options: Joi.array().items(optionSchema).allow(null).optional(),
  required: Joi.boolean().optional(),
  active: Joi.boolean().optional(),
  show_in_form: Joi.boolean().optional(),
  show_in_detail: Joi.boolean().optional(),
  show_in_table: Joi.boolean().optional(),
  filterable: Joi.boolean().optional(),
  display_order: Joi.number().integer().min(0).optional(),
}).min(1).unknown(false);
export const validateCrmFieldUpdate = validate("body", fieldUpdateSchema);

const reorderSchema = Joi.object({
  ordered_ids: Joi.array().items(Joi.number().integer().positive()).required(),
}).unknown(false);
export const validateCrmReorder = validate("body", reorderSchema);

const callsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  provider: Joi.string().trim().max(30).allow("").optional(),
  direction: Joi.string().valid("inbound", "outbound").allow("").optional(),
  lead_id: Joi.number().integer().positive().optional(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateCrmCallsQuery = validate("query", callsQuery);

export const validateCrmCallIngest = validate("body", Joi.object().unknown(true));

const integrationUpdateSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  config: Joi.object().pattern(Joi.string(), Joi.string().allow("")).optional(),
}).min(1).unknown(false);
export const validateCrmIntegrationUpdate = validate("body", integrationUpdateSchema);

const mappingsQuery = Joi.object({
  provider: Joi.string().valid(...CRM_PROVIDERS).required(),
  _client_key: CLIENT_KEY,
  client_key: CLIENT_KEY,
}).unknown(true);
export const validateCrmMappingsQuery = validate("query", mappingsQuery);

const saveMappingsSchema = Joi.object({
  provider: Joi.string().valid(...CRM_PROVIDERS).required(),
  mappings: Joi.array()
    .items(
      Joi.object({
        external_field: Joi.string().trim().max(150).required(),
        target_type: Joi.string().valid("standard", "custom").required(),
        target_field: Joi.string().trim().max(80).required(),
      }),
    )
    .required(),
}).unknown(false);
export const validateCrmSaveMappings = validate("body", saveMappingsSchema);
