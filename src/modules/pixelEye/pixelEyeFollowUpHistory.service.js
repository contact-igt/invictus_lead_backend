import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";
import {
  PIXEL_EYE_FOLLOW_UP_HISTORY_CHANGE_TYPES,
  PIXEL_EYE_FOLLOW_UP_HISTORY_SOURCE_TYPES,
} from "../../database/tables/PixelEyeFollowUpHistoryTable/index.js";

const DEFAULT_CHANGE_TYPE = "UPDATED";
const DEFAULT_SOURCE = "SYSTEM";

const normalizeText = (value) => String(value || "").trim();

const isBlank = (value) => value === null || value === undefined || String(value).trim() === "";

const buildClientCallHistoryKey = (clientId, callId) =>
  `${clientId}:${normalizeText(callId)}`;

const normalizeSupportedValue = (value, allowedValues, fallback) => {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  const matched = allowedValues.find((item) => item === normalized);
  return matched || fallback;
};

const normalizeDateComparable = (value) => {
  if (value === null || value === undefined || value === "") {
    return { kind: "empty", value: null };
  }

  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isNaN(millis)
      ? { kind: "text", value: normalizeText(value) }
      : { kind: "datetime", value: millis };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "datetime", value };
  }

  const text = normalizeText(value);
  if (!text) {
    return { kind: "empty", value: null };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { kind: "date", value: text };
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return { kind: "datetime", value: parsed.getTime() };
  }

  return { kind: "text", value: text };
};

const isSameFollowUpValue = (oldValue, newValue) => {
  const normalizedOld = normalizeDateComparable(oldValue);
  const normalizedNew = normalizeDateComparable(newValue);

  if (normalizedOld.kind === "empty" && normalizedNew.kind === "empty") {
    return true;
  }

  if (normalizedOld.kind !== normalizedNew.kind) {
    return false;
  }

  return normalizedOld.value === normalizedNew.value;
};

const logHistoryError = (fnName, err, context = {}) => {
  console.error(
    JSON.stringify({
      fn: fnName,
      client_id: context.client_id ?? null,
      lead_id: context.lead_id ?? null,
      call_id: context.call_id ?? null,
      error: err?.message,
      stack: err?.stack,
      time: new Date().toISOString(),
    }),
  );
};

const buildBaseWhere = ({ client_id, lead_id, call_id }) => {
  const where = {};

  if (client_id !== undefined && client_id !== null && String(client_id).trim() !== "") {
    where.client_id = client_id;
  }

  if (lead_id !== undefined && lead_id !== null && String(lead_id).trim() !== "") {
    where.lead_id = lead_id;
  }

  if (call_id !== undefined && call_id !== null && String(call_id).trim() !== "") {
    where.call_id = String(call_id).trim();
  }

  return where;
};

export const createFollowUpHistoryEntry = async (data = {}) => {
  const context = {
    client_id: data.client_id,
    lead_id: data.lead_id,
    call_id: data.call_id,
  };

  try {
    const hasOldValue = !isBlank(data.old_follow_up_date);
    const hasNewValue = !isBlank(data.new_follow_up_date);

    if (!hasOldValue && !hasNewValue) {
      return null;
    }

    if (isSameFollowUpValue(data.old_follow_up_date, data.new_follow_up_date)) {
      return null;
    }

    const changeType = normalizeSupportedValue(
      data.change_type,
      PIXEL_EYE_FOLLOW_UP_HISTORY_CHANGE_TYPES,
      DEFAULT_CHANGE_TYPE,
    );
    const source = normalizeSupportedValue(
      data.source,
      PIXEL_EYE_FOLLOW_UP_HISTORY_SOURCE_TYPES,
      DEFAULT_SOURCE,
    );

    const payload = {
      client_id: data.client_id,
      lead_id: data.lead_id,
      call_id: normalizeText(data.call_id),
      phone_number: isBlank(data.phone_number) ? null : normalizeText(data.phone_number),
      customer_name: isBlank(data.customer_name) ? null : normalizeText(data.customer_name),
      old_follow_up_date: hasOldValue ? data.old_follow_up_date : null,
      new_follow_up_date: hasNewValue ? data.new_follow_up_date : null,
      change_type: changeType,
      reason: isBlank(data.reason) ? null : normalizeText(data.reason),
      changed_by_user_id:
        data.changed_by_user_id === undefined || data.changed_by_user_id === null || String(data.changed_by_user_id).trim() === ""
          ? null
          : data.changed_by_user_id,
      changed_by_name: isBlank(data.changed_by_name) ? null : normalizeText(data.changed_by_name),
      source,
    };

    return await db.PixelEyeFollowUpHistory.create(payload);
  } catch (err) {
    logHistoryError("createFollowUpHistoryEntry", err, context);
    return null;
  }
};

export const getFollowUpHistoryForLead = async ({
  client_id,
  lead_id,
  call_id,
} = {}) => {
  try {
    const where = buildBaseWhere({ client_id });
    const filters = [];

    if (lead_id !== undefined && lead_id !== null && String(lead_id).trim() !== "") {
      filters.push({ lead_id });
    }

    if (call_id !== undefined && call_id !== null && String(call_id).trim() !== "") {
      filters.push({ call_id: String(call_id).trim() });
    }

    if (filters.length > 0) {
      where[Op.or] = filters;
    }

    return await db.PixelEyeFollowUpHistory.findAll({
      where,
      order: [
        ["created_at", "DESC"],
        ["id", "DESC"],
      ],
    });
  } catch (err) {
    logHistoryError("getFollowUpHistoryForLead", err, { client_id, lead_id, call_id });
    return [];
  }
};

export const getFollowUpChangeCountsForLeads = async ({
  client_id,
  call_ids = [],
} = {}) => {
  const normalizedCallIds = Array.from(
    new Set(
      (Array.isArray(call_ids) ? call_ids : [])
        .map((callId) => normalizeText(callId))
        .filter(Boolean),
    ),
  );

  const result = {};
  for (const callId of normalizedCallIds) {
    result[callId] = {
      count: 0,
      latest_follow_up_change_at: null,
    };
  }

  if (!client_id || normalizedCallIds.length === 0) {
    return result;
  }

  try {
    const rows = await db.PixelEyeFollowUpHistory.findAll({
      attributes: [
        "call_id",
        [fn("COUNT", col("id")), "count"],
        [fn("MAX", col("created_at")), "latest_follow_up_change_at"],
      ],
      where: {
        client_id,
        call_id: {
          [Op.in]: normalizedCallIds,
        },
      },
      group: ["call_id"],
      raw: true,
    });

    for (const row of rows) {
      const callId = normalizeText(row.call_id);
      if (!callId) continue;

      result[callId] = {
        count: Number(row.count || 0),
        latest_follow_up_change_at: row.latest_follow_up_change_at || null,
      };
    }

    return result;
  } catch (err) {
    logHistoryError("getFollowUpChangeCountsForLeads", err, { client_id });
    return result;
  }
};

export const getFollowUpChangeSummaryMapForLeads = async (leads = []) => {
  try {
    const callIdsByClientId = new Map();

    for (const lead of Array.isArray(leads) ? leads : []) {
      const callId = normalizeText(lead?.call_id);
      if (!lead?.client_id || !callId) {
        continue;
      }

      const existingCallIds = callIdsByClientId.get(lead.client_id) || [];
      existingCallIds.push(callId);
      callIdsByClientId.set(lead.client_id, existingCallIds);
    }

    const summaryMap = new Map();

    for (const [clientId, callIds] of callIdsByClientId.entries()) {
      const historyCounts = await getFollowUpChangeCountsForLeads({
        client_id: clientId,
        call_ids: callIds,
      });

      for (const [callId, summary] of Object.entries(historyCounts)) {
        summaryMap.set(buildClientCallHistoryKey(clientId, callId), summary);
      }
    }

    return summaryMap;
  } catch (err) {
    logHistoryError("getFollowUpChangeSummaryMapForLeads", err);
    return new Map();
  }
};

export const getFollowUpChangeSummaryForLead = (summaryMap, lead) => {
  if (!(summaryMap instanceof Map) || !lead?.client_id || !lead?.call_id) {
    return null;
  }

  return summaryMap.get(buildClientCallHistoryKey(lead.client_id, lead.call_id)) || null;
};

export {
  PIXEL_EYE_FOLLOW_UP_HISTORY_CHANGE_TYPES,
  PIXEL_EYE_FOLLOW_UP_HISTORY_SOURCE_TYPES,
};
