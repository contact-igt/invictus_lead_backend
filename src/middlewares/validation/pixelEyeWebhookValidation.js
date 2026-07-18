import Joi from "joi";
import { normalizePixelEyeMainStatus } from "../../modules/pixelEye/pixelEyeStatusPolicy.js";
import { formatAppDateAndTime, parseAppDateTime } from "../../utils/dateTime.js";

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

const toStringOrUndefined = (value) => {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
};

const getNormalizedCallId = (body, envelope) => {
  return toStringOrUndefined(
    getFirstValue(envelope, ["call_id", "callId", "call_Id"]) ||
      getFirstValue(body, ["call_id", "callId", "call_Id"]),
  );
};

const logWebhookValidationShape = (body, envelope, normalizedCallId) => {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug("[PixelEyeWebhookValidation] received keys", {
    bodyKeys: Object.keys(body || {}),
    payloadKeys:
      envelope && envelope !== body && typeof envelope === "object"
        ? Object.keys(envelope)
        : [],
    hasNormalizedCallId: Boolean(normalizedCallId),
    normalizedCallId: normalizedCallId || null,
  });
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
  const parsedCreatedAt = parseAppDateTime(createdAtRaw);
  const split = parsedCreatedAt
    ? formatAppDateAndTime(parsedCreatedAt)
    : formatAppDateAndTime(new Date());

  return {
    _client_key:
      toStringOrUndefined(
        getFirstValue(body, ["_client_key", "client_key"]) ||
          getFirstValue(envelope, ["_client_key", "client_key"]),
      ) || undefined,
    payload: {
      call_id: getNormalizedCallId(body, envelope),
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
        normalizePixelEyeMainStatus(
          toStringOrUndefined(getFirstValue(envelope, ["status"])),
        ) || "Enquiry",
      type_of_enquiry: toStringOrUndefined(
        getFirstValue(envelope, ["typeOfEnquiry", "type_of_enquiry"]),
      ),
      follow_up_date: toStringOrUndefined(
        getFirstValue(envelope, [
          "followUpDate",
          "follow_up_date",
          "followup_date",
        ]),
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
    status: Joi.string().trim().required(),
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

    console.error("[PixelEyeWebhookAPI][ERROR] validation failed", {
      reason: "Request body must be a JSON object",
    });

    return res.status(400).json(responsePayload);
  }

  const normalized = normalizeWebhookPayload(req.body);
  const envelope =
    req.body?.payload && typeof req.body.payload === "object"
      ? req.body.payload
      : req.body?.data && typeof req.body.data === "object"
        ? req.body.data
        : req.body;

  logWebhookValidationShape(req.body, envelope, normalized?.payload?.call_id);

  if (!normalized?.payload?.call_id) {
    console.error("[PixelEyeWebhookAPI][ERROR] validation failed", {
      reason: "call_id/callId is required.",
      bodyKeys: Object.keys(req.body || {}),
      payloadKeys:
        envelope && envelope !== req.body && typeof envelope === "object"
          ? Object.keys(envelope)
          : [],
    });

    return res.status(400).json({
      success: false,
      message: "Malformed payload",
      details: ["call_id/callId is required."],
    });
  }

  const { error, value } = webhookPayloadSchema.validate(normalized, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const responsePayload = buildValidationErrorResponse(error);

    console.error("[PixelEyeWebhookAPI][ERROR] validation failed", {
      call_id: normalized?.payload?.call_id || null,
      details: responsePayload.details,
    });

    return res.status(400).json(responsePayload);
  }

  req.webhookPayload = value._client_key
    ? { ...value.payload, _client_key: value._client_key }
    : value.payload;

  console.log("[PixelEyeWebhookAPI][SUCCESS] validation passed", {
    call_id: req.webhookPayload.call_id,
    client_key: req.webhookPayload._client_key || null,
  });

  return next();
};
