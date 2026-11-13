import Joi from "joi";

const text = (max = 255) => Joi.string().trim().max(max).allow("").optional();
const phone = Joi.string().trim().pattern(/^(?:\+?91[\s-]?)?[6-9]\d{9}$/).required();
const common = { name: Joi.string().trim().max(150).required(), email: Joi.string().trim().email().max(200).required(), utm_source: text() };
const schemas = {
  "Free Trial": Joi.object({
    name: common.name, phone, branch: Joi.string().trim().max(255).required(),
    time: Joi.string().trim().max(100).required(), goal: text(2000), utm_source: text(),
  }).unknown(false),
  "Contact Message": Joi.object({ ...common, mobile: phone,
    service: Joi.string().trim().max(255).required(), subject: Joi.string().trim().max(2000).required(),
  }).unknown(false),
  "Franchise Enquiry": Joi.object({ ...common, phone,
    city: Joi.string().trim().max(150).required(), state: Joi.string().trim().max(150).required(),
    locality: Joi.string().trim().max(255).required(), pincode: text(10),
    propertyStatus: Joi.string().trim().max(150).required(), propertyRelationship: text(), propertyArea: text(),
    propertyLocation: text(1000), profession: text(), businessExperience: text(2000),
    fitnessExperience: text(), fitnessExperienceDetails: text(2000),
    investmentBudget: Joi.string().trim().max(150).required(), timeline: Joi.string().trim().max(150).required(),
    source: text(), message: text(5000), consent: Joi.string().valid("Yes").required(),
  }).unknown(false),
};
export const phoenixWebsiteSchema = Joi.object({
  formType: Joi.string().valid(...Object.keys(schemas)).required(),
  requestId: Joi.string().guid({ version: "uuidv4" }).required(),
  data: Joi.alternatives().conditional("formType", {
    switch: Object.entries(schemas).map(([is, then]) => ({ is, then: then.required() })),
    otherwise: Joi.forbidden(),
  }),
}).unknown(false).required();
