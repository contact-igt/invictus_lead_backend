import db from "../../database/index.js";
import { normalizePixelEyePhoneNumber } from "./pixelEyePhoneNumber.js";
import { buildAppDateTime, formatAppDateAndTime, parseAppDateTime } from "../../utils/dateTime.js";

const normalizeText = (value) => String(value || "").trim();

const formatDatePartsInTimeZone = (value) => {
  const parts = formatAppDateAndTime(value);
  return parts
    ? { call_date: parts.date, call_time: parts.time }
    : null;
};

const parseDateValue = (value) => parseAppDateTime(value);

const normalizeDateOnly = (value) => {
  const text = normalizeText(value);
  if (!text) return null;

  const directDate = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (directDate) {
    return directDate[0];
  }

  const parsed = parseDateValue(text);
  if (!parsed) {
    return null;
  }

  const parts = formatDatePartsInTimeZone(parsed);
  return parts?.call_date || null;
};

const normalizeTimeOnly = (value) => {
  const text = normalizeText(value);
  if (!text) return null;

  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!timeMatch) {
    return null;
  }

  const hours = String(Number(timeMatch[1])).padStart(2, "0");
  const minutes = String(timeMatch[2]).padStart(2, "0");
  const seconds = String(timeMatch[3] || "00").padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};

const buildDateTimeFromDateAndTime = (date, time) => {
  const callDate = normalizeDateOnly(date);
  const callTime = normalizeTimeOnly(time);

  if (!callDate) {
    return null;
  }

  if (callTime) {
    const combined = buildAppDateTime(callDate, callTime);
    if (!Number.isNaN(combined.getTime())) {
      return {
        call_date: callDate,
        call_time: callTime,
        call_started_at: combined,
      };
    }
  }

  const fallback = buildAppDateTime(callDate, "00:00:00");
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }

  return {
    call_date: callDate,
    call_time: callTime || "00:00:00",
    call_started_at: fallback,
  };
};

export const normalizePhoneNumber = (phoneNumber) => {
  return normalizePixelEyePhoneNumber(phoneNumber);
};

export const buildCallDateTime = ({ date, time, createdAt } = {}) => {
  const fromDateTime = buildDateTimeFromDateAndTime(date, time);
  if (fromDateTime) {
    return fromDateTime;
  }

  const parsedCreatedAt = parseDateValue(createdAt);
  if (parsedCreatedAt) {
    const formatted = formatDatePartsInTimeZone(parsedCreatedAt);
    if (formatted) {
      return {
        call_date: formatted.call_date,
        call_time: formatted.call_time,
        call_started_at: parsedCreatedAt,
      };
    }
  }

  return {
    call_date: normalizeDateOnly(date) || null,
    call_time: normalizeTimeOnly(time) || null,
    call_started_at: null,
  };
};

const toIntegerOrNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const toDateOrNull = (value) => {
  const parsed = parseDateValue(value);
  return parsed ? new Date(parsed.getTime()) : null;
};

const hasExplicitValue = (data, key) => {
  if (!Object.prototype.hasOwnProperty.call(data || {}, key)) {
    return false;
  }

  const value = data[key];
  return value !== undefined && value !== null && value !== "";
};

export const buildPixelEyeCallLogOutcomeMarkerPayload = (
  data = {},
  { includeNulls = false } = {},
) => {
  const payload = {};
  const outcomeDayNumber = toIntegerOrNull(data.outcome_day_number);
  const outcomeStatus = normalizeText(data.outcome_status) || null;
  const outcomeAppliedAt = toDateOrNull(data.outcome_applied_at);

  if (
    includeNulls ||
    (hasExplicitValue(data, "outcome_day_number") && outcomeDayNumber !== null)
  ) {
    payload.outcome_day_number = outcomeDayNumber;
  }

  if (
    includeNulls ||
    (hasExplicitValue(data, "outcome_status") && outcomeStatus !== null)
  ) {
    payload.outcome_status = outcomeStatus;
  }

  if (
    includeNulls ||
    (hasExplicitValue(data, "outcome_applied_at") && outcomeAppliedAt !== null)
  ) {
    payload.outcome_applied_at = outcomeAppliedAt;
  }

  return payload;
};

export const createPixelEyeCallLog = async (data = {}) => {
  try {
    const clientId = data.client_id ?? null;
    const callId = normalizeText(data.call_id);

    if (!clientId) {
      throw new Error("Missing client_id for PixelEye call log");
    }

    if (!callId) {
      throw new Error("Missing call_id for PixelEye call log");
    }

    const normalizedPhoneNumber = normalizePhoneNumber(
      data.normalized_phone_number ?? data.phone_number,
    );
    const callDateTime = buildCallDateTime({
      date: data.date,
      time: data.time,
      createdAt: data.createdAt ?? data.created_at,
    });

    const basePayload = {
      client_id: clientId,
      lead_id: data.lead_id ?? null,
      call_id: callId,
      phone_number: normalizedPhoneNumber,
      normalized_phone_number: normalizedPhoneNumber,
      customer_name: normalizeText(data.customer_name) || null,
      agent_name: normalizeText(data.agent_name) || null,
      call_date: callDateTime.call_date,
      call_time: callDateTime.call_time,
      call_started_at: callDateTime.call_started_at,
      status: normalizeText(data.status) || null,
      source: normalizeText(data.source) || "RUNO_WEBHOOK",
      raw_payload: data.raw_payload ?? null,
      direction: normalizeText(data.direction) || null,
      duration_seconds: toIntegerOrNull(data.duration_seconds),
      recording_url: normalizeText(data.recording_url) || null,
      disposition: normalizeText(data.disposition) || null,
    };

    const createPayload = {
      ...basePayload,
      ...buildPixelEyeCallLogOutcomeMarkerPayload(data, {
        includeNulls: true,
      }),
    };

    const existingLog = await db.PixelEyeCallLog.findOne({
      where: {
        client_id: clientId,
        call_id: callId,
      },
      ...(data.transaction ? { transaction: data.transaction } : {}),
    });

    if (existingLog) {
      // Duplicate Runo webhooks often refresh the raw call log without outcome
      // metadata. Never let that update clear the idempotency markers that keep
      // a later duplicate from applying the same follow-up outcome again.
      const updatePayload = {
        ...basePayload,
        ...buildPixelEyeCallLogOutcomeMarkerPayload(data),
      };

      return await existingLog.update(updatePayload, {
        ...(data.transaction ? { transaction: data.transaction } : {}),
      });
    }

    return await db.PixelEyeCallLog.create(createPayload, {
      ...(data.transaction ? { transaction: data.transaction } : {}),
    });
  } catch (err) {
    console.error(
      `[PixelEye Call Log] createPixelEyeCallLog failed: ${err?.message || err}`,
    );
    return null;
  }
};

const normalizeDateForQuery = (value) => {
  const directDate = normalizeDateOnly(value);
  if (directDate) {
    return directDate;
  }

  const parsed = parseDateValue(value);
  if (!parsed) {
    return null;
  }

  return formatDatePartsInTimeZone(parsed)?.call_date || null;
};

export const findCallLogsForFollowUpDate = async ({
  client_id,
  phone_number,
  follow_up_date,
} = {}) => {
  try {
    const clientId = client_id ?? null;
    const normalizedPhoneNumber = normalizePhoneNumber(phone_number);
    const normalizedFollowUpDate = normalizeDateForQuery(follow_up_date);

    if (!clientId || !normalizedPhoneNumber || !normalizedFollowUpDate) {
      return [];
    }

    return await db.PixelEyeCallLog.findAll({
      where: {
        client_id: clientId,
        normalized_phone_number: normalizedPhoneNumber,
        call_date: normalizedFollowUpDate,
      },
      order: [
        ["call_started_at", "ASC"],
        ["created_at", "ASC"],
      ],
    });
  } catch (err) {
    console.error(
      `[PixelEye Call Log] findCallLogsForFollowUpDate failed: ${err?.message || err}`,
    );
    return [];
  }
};
