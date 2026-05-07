import Joi from "joi";

const RUNO_TIMEZONE = "Asia/Kolkata";

const STATUS_VALUES = [
  "Busy",
  "Not Answering",
  "Switched Off",
  "Missed Call",
  "On Another Call",
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

const nullableString = Joi.string().trim().allow(null, "");

const getFirstValue = (payload, keys) => {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
};

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

const toStringOrUndefined = (value) => {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
};

const normalizeWebhookPayload = (body) => {
  const envelope =
    body?.payload && typeof body.payload === "object"
      ? body.payload
      : body?.data && typeof body.data === "object"
        ? body.data
        : body;

  const createdAtRaw = getFirstValue(envelope, [
    "createdAt",
    "created_at",
    "created_at_time",
  ]);
  const parsedCreatedAt = parseCreatedTimestamp(createdAtRaw);
  const split = parsedCreatedAt
    ? formatDateTimeInTimeZone(parsedCreatedAt, RUNO_TIMEZONE)
    : formatDateTimeInTimeZone(new Date(), RUNO_TIMEZONE);

  return {
    _client_key:
      toStringOrUndefined(
        getFirstValue(body, ["_client_key", "client_key"]) ||
          getFirstValue(envelope, ["_client_key", "client_key"]),
      ) || undefined,
    payload: {
      call_id: toStringOrUndefined(
        getFirstValue(envelope, ["call_id", "callId", "call_Id"]),
      ),
      customer_name: toStringOrUndefined(
        getFirstValue(envelope, ["customerName", "customer_name"]),
      ),
      phone_number: toStringOrUndefined(
        getFirstValue(envelope, ["phoneNumber", "phone_number"]),
      ),
      assigned_to: toStringOrUndefined(
        getFirstValue(envelope, ["agentName", "assigned_to", "agent_name"]),
      ),
      agent_name: toStringOrUndefined(
        getFirstValue(envelope, ["agentName", "agent_name", "assigned_to"]),
      ),
      date:
        toStringOrUndefined(getFirstValue(envelope, ["date"])) || split?.date,
      time:
        toStringOrUndefined(getFirstValue(envelope, ["time"])) || split?.time,
      status:
        toStringOrUndefined(getFirstValue(envelope, ["status"])) || "Enquiry",
      type_of_enquiry: toStringOrUndefined(
        getFirstValue(envelope, ["typeOfEnquiry", "type_of_enquiry"]),
      ),
      follow_up_date: toStringOrUndefined(
        getFirstValue(envelope, ["followUpDate", "follow_up_date", "followup_date"]),
      ),
      source:
        toStringOrUndefined(getFirstValue(envelope, ["source"])) || "Runo",
    },
  };
};

const webhookPayloadSchema = Joi.object({
  _client_key: Joi.string().trim().optional(),
  payload: Joi.object({
    call_id: Joi.string().trim().required(),
    customer_name: Joi.string().trim().required(),
    phone_number: Joi.string()
      .trim()
      .pattern(/^[0-9+\-\s()]+$/)
      .required(),
    assigned_to: nullableString.optional(),
    agent_name: nullableString.optional(),
    date: Joi.string().trim().required(),
    time: Joi.string().trim().required(),
    status: Joi.string()
      .valid(...STATUS_VALUES)
      .required(),
    type_of_enquiry: nullableString.optional(),
    follow_up_date: nullableString.optional(),
    source: nullableString.optional(),
  }).required(),
});

const buildValidationErrorResponse = (error) => {
  return {
    success: false,
    message: "Malformed payload",
    details: error.details.map((item) => item.message),
  };
};

export const validatePixelEyeWebhookPayload = async (req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    const responsePayload = {
      success: false,
      message: "Malformed payload",
      details: ["Request body must be a JSON object"],
    };

    return res.status(400).json(responsePayload);
  }

  const normalized = normalizeWebhookPayload(req.body);
  const { error, value } = webhookPayloadSchema.validate(normalized, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const responsePayload = buildValidationErrorResponse(error);

    return res.status(400).json(responsePayload);
  }

  req.webhookPayload = value._client_key
    ? { ...value.payload, _client_key: value._client_key }
    : value.payload;

  return next();
};
