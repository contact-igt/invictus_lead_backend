import Joi from "joi";
import {
  getAllowedStatusesForDay,
  isControlledDayOutcomeStatus,
  normalizePixelEyeMainStatus,
  normalizePixelEyeOutcomeStatus,
} from "../../modules/pixelEye/pixelEyeStatusPolicy.js";
import { formatAppDateAndTime, parseAppDateTime } from "../../utils/dateTime.js";

const DAY_FIELDS = ["day_1", "day_2", "day_3", "day_4", "day_5"];

const nullableString = Joi.string().allow(null, "").optional();
const nullableNotes = Joi.string().max(5000).allow(null, "").optional();
const nullableMainStatus = Joi.string().trim().allow(null, "").optional();
const nullableOutcomeStatus = Joi.string().trim().allow(null, "").optional();
const requiredString = Joi.string().trim().required();
const requiredPhone = Joi.string()
  .trim()
  .pattern(/^[0-9+\-\s]+$/)
  .required();
const optionalPhone = Joi.string()
  .trim()
  .pattern(/^[0-9+\-\s]+$/)
  .allow(null, "")
  .optional();

const getFirstValue = (payload, keys) => {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
};

const splitDateTime = (dateTimeRaw) => {
  const parsed = parseAppDateTime(dateTimeRaw);
  if (!parsed) return null;
  return formatAppDateAndTime(parsed);
};

const nowAsDateTime = () => formatAppDateAndTime(new Date());

const toStringOrUndefined = (value) =>
  value === undefined || value === null ? undefined : String(value).trim();

const validateDayOutcomeValue = (value, dayNumber, helpers) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return value;
  }

  const normalized = normalizePixelEyeOutcomeStatus(value);
  const allowed = getAllowedStatusesForDay(dayNumber);
  if (!allowed.includes(normalized)) {
    return helpers.error("any.invalid", { dayNumber });
  }

  return normalized;
};

const dayOutcomeSchema = (dayNumber) =>
  nullableOutcomeStatus.custom(
    (value, helpers) => validateDayOutcomeValue(value, dayNumber, helpers),
    `day ${dayNumber} outcome status validation`,
  );

export const pixelEyeCreateSchema = Joi.object({
  date: requiredString,
  time: requiredString,
  call_id: requiredString,
  customer_name: requiredString,
  phone_number: requiredPhone,
  agent_name: nullableString,
  source: nullableString,
  type_of_enquiry: nullableString,
  notes: nullableNotes,
  follow_up_date: nullableString,
  status: Joi.string().trim().required(),
  day_1: dayOutcomeSchema(1),
  day_2: dayOutcomeSchema(2),
  day_3: dayOutcomeSchema(3),
  day_4: dayOutcomeSchema(4),
  day_5: dayOutcomeSchema(5),
}).unknown(false);

export const pixelEyeUpdateSchema = Joi.object({
  date: nullableString,
  time: nullableString,
  call_id: nullableString,
  customer_name: nullableString,
  phone_number: optionalPhone,
  agent_name: nullableString,
  source: nullableString,
  type_of_enquiry: nullableString,
  notes: nullableNotes,
  follow_up_date: nullableString,
  reason: nullableString,
  status: nullableMainStatus,
  day_1: dayOutcomeSchema(1),
  day_2: dayOutcomeSchema(2),
  day_3: dayOutcomeSchema(3),
  day_4: dayOutcomeSchema(4),
  day_5: dayOutcomeSchema(5),
  day: Joi.string()
    .valid(...DAY_FIELDS)
    .optional(),
  value: nullableOutcomeStatus,
})
  .or(
    "date",
    "time",
    "call_id",
    "customer_name",
    "phone_number",
    "agent_name",
    "source",
    "type_of_enquiry",
    "notes",
    "follow_up_date",
    "reason",
    "status",
    "day_1",
    "day_2",
    "day_3",
    "day_4",
    "day_5",
    "day",
    "value",
  )
  .custom((value, helpers) => {
    const hasDay = Object.prototype.hasOwnProperty.call(value, "day");
    const hasValue = Object.prototype.hasOwnProperty.call(value, "value");
    if (hasDay !== hasValue) {
      return helpers.error("any.invalid");
    }
    if (hasDay && hasValue) {
      const dayNumber = DAY_FIELDS.indexOf(value.day) + 1;
      if (dayNumber < 1) {
        return helpers.error("any.invalid");
      }
      const normalized = normalizePixelEyeOutcomeStatus(value.value);
      if (
        normalized &&
        !getAllowedStatusesForDay(dayNumber).includes(normalized)
      ) {
        return helpers.error("any.invalid");
      }
      value.value = normalized;
    }
    return value;
  }, "day and value pairing")
  .messages({
    "any.invalid": "Both day and value must be provided together",
  })
  .unknown(false);

export const pixelEyeFollowUpOutcomeSchema = Joi.object({
  status: Joi.string()
    .custom((value, helpers) => {
      const normalized = normalizePixelEyeOutcomeStatus(value);
      if (!isControlledDayOutcomeStatus(normalized)) {
        return helpers.error("any.only");
      }
      return normalized;
    }, "controlled follow-up outcome status validation")
    .required()
    .messages({
      "any.required": "status is required",
      "string.empty": "status is required",
      "any.only": "Invalid follow-up outcome status",
    }),
}).unknown(false);

// Strip internal routing metadata (_client_key etc.) before schema validation
const stripInternalFields = (body) => {
  const { _client_key, ...rest } = body;
  return { stripped: rest, _client_key };
};

const normalizeCreatePayload = (body) => {
  const envelope =
    body?.payload && typeof body.payload === "object"
      ? body.payload
      : body?.data && typeof body.data === "object"
        ? body.data
        : body;

  const normalizedClientKey =
    body?._client_key ||
    body?.client_key ||
    envelope?._client_key ||
    envelope?.client_key ||
    undefined;

  const createdAt = getFirstValue(envelope, [
    "createdAt",
    "created_at",
    "created_at_time",
  ]);
  const split =
    splitDateTime(createdAt) ||
    (getFirstValue(envelope, ["date"]) || getFirstValue(envelope, ["time"])
      ? null
      : nowAsDateTime());

  const normalized = {
    date: toStringOrUndefined(getFirstValue(envelope, ["date"])) || split?.date,
    time: toStringOrUndefined(getFirstValue(envelope, ["time"])) || split?.time,
    call_id: toStringOrUndefined(
      getFirstValue(envelope, ["call_id", "callId", "call_Id"]),
    ),
    customer_name: toStringOrUndefined(
      getFirstValue(envelope, ["customer_name", "customerName"]),
    ),
    phone_number: toStringOrUndefined(
      getFirstValue(envelope, ["phone_number", "phoneNumber"]),
    ),
    agent_name: toStringOrUndefined(
      getFirstValue(envelope, ["agent_name", "agentName"]),
    ),
    source: toStringOrUndefined(getFirstValue(envelope, ["source"])),
    type_of_enquiry: toStringOrUndefined(
      getFirstValue(envelope, ["type_of_enquiry", "typeOfEnquiry"]),
    ),
    follow_up_date: toStringOrUndefined(
      getFirstValue(envelope, ["follow_up_date", "followUpDate"]),
    ),
    status:
      normalizePixelEyeMainStatus(
        toStringOrUndefined(getFirstValue(envelope, ["status"])),
      ) || "Enquiry",
    day_1: normalizePixelEyeOutcomeStatus(
      toStringOrUndefined(getFirstValue(envelope, ["day_1"])),
    ),
    day_2: normalizePixelEyeOutcomeStatus(
      toStringOrUndefined(getFirstValue(envelope, ["day_2"])),
    ),
    day_3: normalizePixelEyeOutcomeStatus(
      toStringOrUndefined(getFirstValue(envelope, ["day_3"])),
    ),
    day_4: normalizePixelEyeOutcomeStatus(
      toStringOrUndefined(getFirstValue(envelope, ["day_4"])),
    ),
    day_5: normalizePixelEyeOutcomeStatus(
      toStringOrUndefined(getFirstValue(envelope, ["day_5"])),
    ),
  };

  return {
    normalized,
    _client_key: normalizedClientKey,
  };
};

export const validatePixelEyeCreate = (req, res, next) => {
  const { normalized, _client_key } = normalizeCreatePayload(req.body);
  const { error, value } = pixelEyeCreateSchema.validate(normalized, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res
      .status(400)
      .json({ message: "Validation error", details: error.details });
  }
  // Re-attach so the existing controller can resolve client_id for super-admin
  req.body = _client_key ? { ...value, _client_key } : value;
  next();
};

export const validatePixelEyeUpdate = (req, res, next) => {
  const { stripped, _client_key } = stripInternalFields(req.body);
  const normalized = { ...stripped };
  for (const field of ["value", ...DAY_FIELDS]) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = normalizePixelEyeOutcomeStatus(normalized[field]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "status")) {
    normalized.status = normalizePixelEyeMainStatus(normalized.status);
  }
  const { error, value } = pixelEyeUpdateSchema.validate(normalized, {
    abortEarly: false,
  });
  if (error) {
    return res
      .status(400)
      .json({ message: "Validation error", details: error.details });
  }
  req.body = _client_key ? { ...value, _client_key } : value;
  next();
};

export const validatePixelEyeFollowUpOutcome = (req, res, next) => {
  const normalized = {
    status: normalizePixelEyeOutcomeStatus(req.body?.status),
  };
  const { error, value } = pixelEyeFollowUpOutcomeSchema.validate(normalized, {
    abortEarly: false,
  });

  if (error) {
    return res.status(400).json({
      message: error.details[0]?.message || "Invalid follow-up outcome status",
      details: error.details,
    });
  }

  req.body = value;
  next();
};
