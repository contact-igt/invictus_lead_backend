import Joi from "joi";

const STATUS_VALUES = [
  "Busy",
  "Not Answering",
  "On Another Call",
  "Switched Off",
  "Missed Call",
  "DND",
  "Dnp 2",
  "Not Speaking",
  "Disconnecting",
  "Not in Network",
  "Incoming Call Not Available",
  "Number Not in Service",
  "Wrong Number",
  "Wrongly Dialed",
  "Fraud Call",
  "Enquiry",
  "Hot Follow-up",
  "Follow-up Required",
  "Will Call Later",
  "Rescheduling",
  "Doctor Time",
  "Follow-up Post Appointment",
  "Want to Speak With Doctor",
  "Appointment Fixed",
  "Appointment Cancelled",
  "Visited",
  "Walk-in",
  "Not Interested",
  "Not Willing to Come Now",
  "Searching for Specific Hospital",
  "Going to Other Hospital",
  "Not in Hyderabad",
  "Long Distance",
  "Address Requested",
  "Closed",
  "Others",
];

const DAY_FIELDS = ["day_1", "day_2", "day_3", "day_4", "day_5"];

const nullableString = Joi.string().allow(null, "").optional();
const nullableStatus = Joi.string()
  .valid(...STATUS_VALUES)
  .allow(null, "")
  .optional();
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

const RUNO_TIMEZONE = "Asia/Kolkata";

const formatDateTimeInTimeZone = (date, timeZone = RUNO_TIMEZONE) => {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const year = dateParts.find((part) => part.type === "year")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value;
  const day = dateParts.find((part) => part.type === "day")?.value;

  const hour = timeParts.find((part) => part.type === "hour")?.value;
  const minute = timeParts.find((part) => part.type === "minute")?.value;
  const second = timeParts.find((part) => part.type === "second")?.value;

  if (!year || !month || !day || !hour || !minute || !second) {
    return null;
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
  };
};

const parseCreatedTimestamp = (dateTimeRaw) => {
  if (dateTimeRaw === undefined || dateTimeRaw === null || dateTimeRaw === "") {
    return null;
  }

  if (typeof dateTimeRaw === "number" && Number.isFinite(dateTimeRaw)) {
    // Runo often sends epoch in seconds, similar to Apps Script conversion: new Date(ts * 1000).
    const millis = dateTimeRaw < 1e12 ? dateTimeRaw * 1000 : dateTimeRaw;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const text = String(dateTimeRaw).trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const numericTs = Number(text);
    if (!Number.isFinite(numericTs)) return null;
    const millis = numericTs < 1e12 ? numericTs * 1000 : numericTs;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const splitDateTime = (dateTimeRaw) => {
  const parsed = parseCreatedTimestamp(dateTimeRaw);
  if (!parsed) return null;
  return formatDateTimeInTimeZone(parsed, RUNO_TIMEZONE);
};

const nowAsDateTime = () => {
  const now = new Date();
  return formatDateTimeInTimeZone(now, RUNO_TIMEZONE);
};

const toStringOrUndefined = (value) =>
  value === undefined || value === null ? undefined : String(value).trim();

export const pixelEyeCreateSchema = Joi.object({
  date: requiredString,
  time: requiredString,
  call_id: requiredString,
  customer_name: requiredString,
  phone_number: requiredPhone,
  agent_name: nullableString,
  source: nullableString,
  type_of_enquiry: nullableString,
  follow_up_date: nullableString,
  status: Joi.string()
    .valid(...STATUS_VALUES)
    .required(),
  day_1: nullableStatus,
  day_2: nullableStatus,
  day_3: nullableStatus,
  day_4: nullableStatus,
  day_5: nullableStatus,
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
  follow_up_date: nullableString,
  status: nullableStatus,
  day_1: nullableStatus,
  day_2: nullableStatus,
  day_3: nullableStatus,
  day_4: nullableStatus,
  day_5: nullableStatus,
  day: Joi.string()
    .valid(...DAY_FIELDS)
    .optional(),
  value: nullableStatus,
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
    "follow_up_date",
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
    return value;
  }, "day and value pairing")
  .messages({
    "any.invalid": "Both day and value must be provided together",
  })
  .unknown(false);

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
      toStringOrUndefined(getFirstValue(envelope, ["status"])) || "Enquiry",
    day_1: toStringOrUndefined(getFirstValue(envelope, ["day_1"])),
    day_2: toStringOrUndefined(getFirstValue(envelope, ["day_2"])),
    day_3: toStringOrUndefined(getFirstValue(envelope, ["day_3"])),
    day_4: toStringOrUndefined(getFirstValue(envelope, ["day_4"])),
    day_5: toStringOrUndefined(getFirstValue(envelope, ["day_5"])),
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
  const { error } = pixelEyeUpdateSchema.validate(stripped, {
    abortEarly: false,
  });
  if (error) {
    return res
      .status(400)
      .json({ message: "Validation error", details: error.details });
  }
  req.body = _client_key ? { ...stripped, _client_key } : stripped;
  next();
};
