import { Op } from "sequelize";
import db from "../../database/index.js";
import {
  findCallLogsForFollowUpDate,
  normalizePhoneNumber,
} from "./pixelEyeCallLog.service.js";
import { isTerminalLeadStatus } from "./pixelEyeNotification.service.js";
import { createFollowUpHistoryEntry } from "./pixelEyeFollowUpHistory.service.js";
import { buildAppDateTime, formatAppDateAndTime, parseAppDateTime } from "../../utils/dateTime.js";

const DEFAULT_PENDING_REASON = "Pending follow-up call check";
const DEFAULT_CALLED_REASON = "Call found from Runo webhook";
const DEFAULT_MISSED_REASON = "No call found after allowed window";

const normalizeText = (value) => String(value || "").trim();

const parseDateValue = (value) => parseAppDateTime(value);

const formatDatePartsInTimeZone = (value) => {
  const parts = formatAppDateAndTime(value);
  return parts
    ? {
        scheduled_follow_up_date: parts.date,
        scheduled_follow_up_time: parts.time,
      }
    : null;
};

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
  return parts?.scheduled_follow_up_date || null;
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

const buildFollowUpTimestamp = (followUpDate) => {
  const parsed = parseDateValue(followUpDate);
  if (!parsed) {
    return null;
  }

  const directDate = normalizeDateOnly(followUpDate);
  const directTime = normalizeTimeOnly(followUpDate);

  if (directDate && directTime) {
    const scheduled = buildAppDateTime(directDate, directTime);
    if (!Number.isNaN(scheduled.getTime())) {
      return scheduled;
    }
  }

  if (directDate) {
    const scheduled = buildAppDateTime(directDate, "09:00:00");
    if (!Number.isNaN(scheduled.getTime())) {
      return scheduled;
    }
  }

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
};

const getManualFollowUpAllowedUntil = (
  followUpDate,
) => {
  const scheduledAt = buildFollowUpTimestamp(followUpDate);
  if (!scheduledAt) {
    return null;
  }

  const formatted = formatDatePartsInTimeZone(scheduledAt);
  if (!formatted?.scheduled_follow_up_date) {
    return null;
  }

  const allowedUntil = buildAppDateTime(
    formatted.scheduled_follow_up_date,
    "23:59:59.999",
  );
  if (!allowedUntil) {
    return null;
  }

  return allowedUntil;
};

const buildComplianceWindow = (followUpDate) => {
  const scheduledAt = buildFollowUpTimestamp(followUpDate);
  if (!scheduledAt) {
    return null;
  }

  const formatted = formatDatePartsInTimeZone(scheduledAt);
  if (!formatted) {
    return null;
  }

  const allowedUntil = getManualFollowUpAllowedUntil(followUpDate);
  if (!allowedUntil || Number.isNaN(allowedUntil.getTime())) {
    return null;
  }

  return {
    scheduled_follow_up_date: formatted.scheduled_follow_up_date,
    scheduled_follow_up_at: scheduledAt,
    allowed_until: allowedUntil,
  };
};

const normalizeSource = (source) => {
  const text = normalizeText(source);
  if (!text) return "SYSTEM";

  const allowed = new Set(["SYSTEM", "FRONTEND", "RUNO_WEBHOOK", "SCHEDULER"]);
  return allowed.has(text) ? text : "SYSTEM";
};

const normalizeStatus = (status) => {
  const text = normalizeText(status).toUpperCase();
  const allowed = new Set([
    "PENDING",
    "CALLED",
    "MISSED",
    "IGNORED",
    "CANCELLED",
  ]);
  return allowed.has(text) ? text : "PENDING";
};

const logComplianceError = (fn, err, context = {}) => {
  console.error(
    JSON.stringify({
      fn,
      client_id: context.client_id ?? null,
      lead_id: context.lead_id ?? null,
      call_id: context.call_id ?? null,
      compliance_id: context.compliance_id ?? null,
      error: err?.message,
      stack: err?.stack,
      time: new Date().toISOString(),
    }),
  );
};

const normalizeAffectedCount = (result) => {
  if (Array.isArray(result)) {
    return Number(result[0] || 0);
  }

  return Number(result || 0);
};

export const buildFollowUpComplianceWindow = ({ follow_up_date } = {}) => {
  try {
    return buildComplianceWindow(follow_up_date);
  } catch (err) {
    logComplianceError("buildFollowUpComplianceWindow", err);
    return null;
  }
};

export const createOrUpdatePendingFollowUpCompliance = async (data = {}) => {
  try {
    const clientId = data.client_id ?? null;
    const callId = normalizeText(data.call_id);
    const leadId = Number(data.lead_id || 0) || null;

    if (!clientId || !callId) {
      throw new Error("Missing client_id or call_id for follow-up compliance");
    }

    const window = buildFollowUpComplianceWindow({
      follow_up_date: data.follow_up_date,
    });

    if (!window) {
      return null;
    }

    const normalizedPhoneNumber = normalizePhoneNumber(data.phone_number);
    const payload = {
      client_id: clientId,
      lead_id: leadId,
      call_id: callId,
      phone_number: normalizedPhoneNumber,
      normalized_phone_number: normalizedPhoneNumber,
      customer_name: normalizeText(data.customer_name) || null,
      agent_name: normalizeText(data.agent_name) || null,
      scheduled_follow_up_date: window.scheduled_follow_up_date,
      scheduled_follow_up_at: window.scheduled_follow_up_at,
      allowed_until: window.allowed_until,
      compliance_status: "PENDING",
      matched_call_log_id: null,
      matched_call_id: null,
      matched_call_started_at: null,
      reason: normalizeText(data.reason) || DEFAULT_PENDING_REASON,
      source: normalizeSource(data.source),
    };

    const existingRow = await db.PixelEyeFollowUpCallCompliance.findOne({
      where: leadId
        ? {
            client_id: clientId,
            lead_id: leadId,
            scheduled_follow_up_date: window.scheduled_follow_up_date,
          }
        : normalizedPhoneNumber
          ? {
              client_id: clientId,
              normalized_phone_number: normalizedPhoneNumber,
              scheduled_follow_up_date: window.scheduled_follow_up_date,
            }
          : {
              client_id: clientId,
              call_id: callId,
              scheduled_follow_up_date: window.scheduled_follow_up_date,
            },
    });

    if (existingRow) {
      return await existingRow.update(payload);
    }

    return await db.PixelEyeFollowUpCallCompliance.create(payload);
  } catch (err) {
    logComplianceError("createOrUpdatePendingFollowUpCompliance", err, {
      client_id: data?.client_id,
      lead_id: data?.lead_id,
      call_id: data?.call_id,
    });
    return null;
  }
};

export const cancelPendingFollowUpComplianceForLead = async ({
  client_id,
  lead_id,
  reason = "Superseded by updated follow-up date",
  source = "SYSTEM",
  transaction,
  throwOnError = false,
} = {}) => {
  try {
    const clientId = client_id ?? null;
    const leadId = Number(lead_id || 0) || null;

    if (!clientId || !leadId) {
      return 0;
    }

    const result = await db.PixelEyeFollowUpCallCompliance.update(
      {
        compliance_status: "CANCELLED",
        reason: normalizeText(reason) || "Superseded by updated follow-up date",
        source: normalizeSource(source),
      },
      {
        where: {
          client_id: clientId,
          lead_id: leadId,
          compliance_status: "PENDING",
        },
        ...(transaction ? { transaction } : {}),
      },
    );

    return normalizeAffectedCount(result);
  } catch (err) {
    logComplianceError("cancelPendingFollowUpComplianceForLead", err, {
      client_id,
      lead_id,
    });
    if (throwOnError) {
      throw err;
    }
    return 0;
  }
};

export const getPendingFollowUpComplianceForLead = async ({
  client_id,
  lead_id,
  transaction,
  throwOnError = false,
} = {}) => {
  try {
    const clientId = client_id ?? null;
    const leadId = Number(lead_id || 0) || null;

    if (!clientId || !leadId) {
      return [];
    }

    return await db.PixelEyeFollowUpCallCompliance.findAll({
      where: {
        client_id: clientId,
        lead_id: leadId,
        compliance_status: "PENDING",
      },
      order: [
        ["scheduled_follow_up_at", "ASC"],
        ["createdAt", "ASC"],
      ],
      ...(transaction ? { transaction } : {}),
    });
  } catch (err) {
    logComplianceError("getPendingFollowUpComplianceForLead", err, {
      client_id,
      lead_id,
    });
    if (throwOnError) {
      throw err;
    }
    return [];
  }
};

export const markPendingFollowUpComplianceCalledForLead = async ({
  client_id,
  lead_id,
  follow_up_date,
  reason,
  source,
} = {}) => {
  try {
    const clientId = client_id ?? null;
    const leadId = Number(lead_id || 0) || null;

    if (!clientId || !leadId) {
      throw new Error("Missing client_id or lead_id for called compliance update");
    }

    const where = {
      client_id: clientId,
      lead_id: leadId,
      compliance_status: "PENDING",
    };

    const scheduledDate = normalizeDateOnly(follow_up_date);
    if (scheduledDate) {
      where.scheduled_follow_up_date = scheduledDate;
    }

    const row = await db.PixelEyeFollowUpCallCompliance.findOne({
      where,
      order: [
        ["scheduled_follow_up_at", "ASC"],
        ["updatedAt", "DESC"],
      ],
    });

    if (!row) {
      return null;
    }

    return await row.update({
      compliance_status: "CALLED",
      matched_call_log_id: null,
      matched_call_id: null,
      matched_call_started_at: new Date(),
      reason:
        normalizeText(reason) ||
        "Manual same-phone follow-up signal received",
      source: normalizeSource(source || "FRONTEND"),
    });
  } catch (err) {
    logComplianceError("markPendingFollowUpComplianceCalledForLead", err, {
      client_id,
      lead_id,
    });
    return null;
  }
};
export const markComplianceAsCalled = async ({
  compliance_id,
  callLog,
  reason,
  source,
} = {}) => {
  try {
    if (!compliance_id || !callLog?.id) {
      throw new Error("Missing compliance_id or callLog for called update");
    }

    const row = await db.PixelEyeFollowUpCallCompliance.findOne({
      where: { id: compliance_id },
    });

    if (!row) {
      return null;
    }

    return await row.update({
      compliance_status: "CALLED",
      matched_call_log_id: callLog.id,
      matched_call_id: callLog.call_id ?? null,
      matched_call_started_at: callLog.call_started_at ?? null,
      reason: normalizeText(reason) || DEFAULT_CALLED_REASON,
      source: normalizeSource(source),
    });
  } catch (err) {
    logComplianceError("markComplianceAsCalled", err, {
      compliance_id,
      call_id: callLog?.call_id,
    });
    return null;
  }
};

export const findPendingComplianceForCallLog = async (callLog) => {
  try {
    if (!callLog?.client_id || !callLog?.call_date) {
      return [];
    }

    if (callLog?.lead_id) {
      const leadScopedRows = await db.PixelEyeFollowUpCallCompliance.findAll({
        where: {
          client_id: callLog.client_id,
          lead_id: callLog.lead_id,
          scheduled_follow_up_date: callLog.call_date,
          compliance_status: "PENDING",
        },
        order: [["scheduled_follow_up_at", "ASC"]],
      });

      if (leadScopedRows.length > 0) {
        return leadScopedRows;
      }
    }

    if (!callLog?.normalized_phone_number) {
      return [];
    }

    return await db.PixelEyeFollowUpCallCompliance.findAll({
      where: {
        client_id: callLog.client_id,
        normalized_phone_number: callLog.normalized_phone_number,
        scheduled_follow_up_date: callLog.call_date,
        compliance_status: "PENDING",
      },
      order: [["scheduled_follow_up_at", "ASC"]],
    });
  } catch (err) {
    logComplianceError("findPendingComplianceForCallLog", err, {
      client_id: callLog?.client_id,
      call_id: callLog?.call_id,
    });
    return [];
  }
};

export const findDuePendingCompliance = async ({ limit = 50 } = {}) => {
  try {
    const now = new Date();

    return await db.PixelEyeFollowUpCallCompliance.findAll({
      where: {
        compliance_status: "PENDING",
        allowed_until: {
          [Op.lte]: now,
        },
      },
      order: [["allowed_until", "ASC"]],
      limit: Number.isFinite(Number(limit))
        ? Math.max(parseInt(limit, 10), 1)
        : 50,
    });
  } catch (err) {
    logComplianceError("findDuePendingCompliance", err);
    return [];
  }
};

export const markComplianceAsMissed = async ({
  compliance_id,
  reason,
  source,
  transaction,
} = {}) => {
  try {
    if (!compliance_id) {
      throw new Error("Missing compliance_id for missed update");
    }

    const result = await db.PixelEyeFollowUpCallCompliance.update(
      {
        compliance_status: "MISSED",
        reason: normalizeText(reason) || DEFAULT_MISSED_REASON,
        source: normalizeSource(source || "SCHEDULER"),
      },
      {
        where: { id: compliance_id, compliance_status: "PENDING" },
        ...(transaction ? { transaction } : {}),
      },
    );

    if (normalizeAffectedCount(result) === 0) {
      return null;
    }

    return await db.PixelEyeFollowUpCallCompliance.findOne({
      where: { id: compliance_id },
      ...(transaction ? { transaction } : {}),
    });
  } catch (err) {
    logComplianceError("markComplianceAsMissed", err, {
      compliance_id,
    });
    return null;
  }
};

export const markComplianceAsIgnored = async ({
  compliance_id,
  reason,
  source,
} = {}) => {
  try {
    if (!compliance_id) {
      throw new Error("Missing compliance_id for ignored update");
    }

    const row = await db.PixelEyeFollowUpCallCompliance.findOne({
      where: { id: compliance_id },
    });

    if (!row) {
      return null;
    }

    return await row.update({
      compliance_status: "IGNORED",
      reason: normalizeText(reason) || "Skipped because lead is terminal",
      source: normalizeSource(source || "SCHEDULER"),
    });
  } catch (err) {
    logComplianceError("markComplianceAsIgnored", err, {
      compliance_id,
    });
    return null;
  }
};

const pickBestCallLog = (callLogs = [], scheduledFollowUpAt = null) => {
  if (!Array.isArray(callLogs) || callLogs.length === 0) {
    return null;
  }

  const targetTime = scheduledFollowUpAt
    ? new Date(scheduledFollowUpAt).getTime()
    : null;
  const validTargetTime = Number.isFinite(targetTime) ? targetTime : null;

  const scored = callLogs
    .slice()
    .map((callLog) => {
      const startedAt = callLog?.call_started_at
        ? new Date(callLog.call_started_at)
        : null;
      const startedAtMs =
        startedAt && !Number.isNaN(startedAt.getTime())
          ? startedAt.getTime()
          : null;

      return {
        callLog,
        diff:
          validTargetTime !== null && startedAtMs !== null
            ? Math.abs(startedAtMs - validTargetTime)
            : Number.POSITIVE_INFINITY,
        startedAtMs: startedAtMs ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      return a.startedAtMs - b.startedAtMs;
    });

  return scored[0]?.callLog || null;
};

const getReminderStateForCompliance = async (complianceRow) => {
  if (!complianceRow?.client_id) {
    return null;
  }

  if (complianceRow?.lead_id) {
    const leadState = await db.PixelEyeLeadState.findOne({
      where: {
        client_id: complianceRow.client_id,
        lead_id: complianceRow.lead_id,
      },
    });

    if (leadState) {
      return leadState;
    }
  }

  if (complianceRow?.normalized_phone_number) {
    const phoneState = await db.PixelEyeLeadState.findOne({
      where: {
        client_id: complianceRow.client_id,
        normalized_phone_number: complianceRow.normalized_phone_number,
      },
    });

    if (phoneState) {
      return phoneState;
    }
  }

  if (!complianceRow?.call_id) {
    return null;
  }

  return await db.PixelEyeLeadState.findOne({
    where: {
      client_id: complianceRow.client_id,
      call_id: complianceRow.call_id,
    },
  });
};

const hasAllDayFieldsFilled = (lead) => {
  if (!lead) return false;

  return ["day_1", "day_2", "day_3", "day_4", "day_5"].every((field) =>
    Boolean(normalizeText(lead[field])),
  );
};

const shouldIgnoreComplianceDueToLeadState = (lead, reminderState) => {
  if (!lead) {
    return { ignore: true, reason: "Skipped because lead no longer exists" };
  }

  if (isTerminalLeadStatus(lead.status)) {
    return {
      ignore: true,
      reason: `Skipped because lead is terminal: ${lead.status}`,
    };
  }

  if (hasAllDayFieldsFilled(lead)) {
    return {
      ignore: true,
      reason: "Skipped because all day outcomes are already filled",
    };
  }

  if (!reminderState) {
    return { ignore: false, reason: null };
  }

  if (reminderState.permanently_closed) {
    return {
      ignore: true,
      reason: "Skipped because reminder is permanently closed",
    };
  }

  const reminderStateName = String(reminderState.state || "")
    .trim()
    .toLowerCase();
  if (reminderStateName === "completed") {
    const completionSource = String(reminderState.completion_source || "")
      .trim()
      .toLowerCase();
    if (completionSource === "notification_sent") {
      return { ignore: false, reason: null };
    }
    return { ignore: true, reason: "Skipped because reminder is completed" };
  }
  if (reminderStateName === "cancelled") {
    return { ignore: true, reason: "Skipped because reminder is cancelled" };
  }

  return { ignore: false, reason: null };
};

const clearLeadFollowUpDateForMissedCompliance = async (
  complianceRow,
  { transaction } = {},
) => {
  if (!complianceRow?.client_id) {
    return null;
  }

  let lead = null;

  if (complianceRow?.lead_id) {
    lead = await db.PixelEye.findOne({
      where: {
        id: complianceRow.lead_id,
        client_id: complianceRow.client_id,
      },
      ...(transaction ? { transaction } : {}),
    });
  }

  if (!lead && complianceRow?.call_id) {
    lead = await db.PixelEye.findOne({
      where: {
        client_id: complianceRow.client_id,
        call_id: complianceRow.call_id,
      },
      ...(transaction ? { transaction } : {}),
    });
  }

  if (!lead || !lead.follow_up_date) {
    return null;
  }

  const oldFollowUpDate = lead.follow_up_date;
  await lead.update(
    { follow_up_date: null },
    transaction ? { transaction } : undefined,
  );

  await createFollowUpHistoryEntry({
    client_id: lead.client_id,
    lead_id: lead.id,
    call_id: lead.call_id,
    phone_number: lead.phone_number,
    customer_name: lead.customer_name,
    old_follow_up_date: oldFollowUpDate,
    new_follow_up_date: null,
    change_type: "CLEARED",
    source: "SYSTEM",
    reason: "Follow-up date cleared after missed compliance window",
    changed_by_user_id: null,
    changed_by_name: "Compliance Scheduler",
    transaction,
  });

  return lead;
};

export const processDuePendingComplianceBatch = async ({ limit = 50 } = {}) => {
  try {
    const dueRows = await findDuePendingCompliance({ limit });
    if (!Array.isArray(dueRows) || dueRows.length === 0) {
      return { processed: 0, called: 0, missed: 0, ignored: 0 };
    }

    let called = 0;
    let missed = 0;
    let ignored = 0;

    for (const row of dueRows) {
      try {
        const callLogs = await findCallLogsForFollowUpDate({
          client_id: row.client_id,
          phone_number: row.phone_number,
          follow_up_date:
            row.scheduled_follow_up_at || row.scheduled_follow_up_date,
        });

        if (Array.isArray(callLogs) && callLogs.length > 0) {
          const bestCallLog = pickBestCallLog(
            callLogs,
            row.scheduled_follow_up_at,
          );
          if (bestCallLog) {
            const updated = await markComplianceAsCalled({
              compliance_id: row.id,
              callLog: bestCallLog,
              reason: "Call found during compliance scheduler check",
              source: "SCHEDULER",
            });
            if (updated) {
              called += 1;
            }
          }
          continue;
        }

        const lead =
          row?.client_id && row?.call_id
            ? await db.PixelEye.findOne({
                where: {
                  client_id: row.client_id,
                  call_id: row.call_id,
                },
              })
            : null;
        const reminderState = await getReminderStateForCompliance(row);
        const skipDecision = shouldIgnoreComplianceDueToLeadState(
          lead,
          reminderState,
        );

        if (skipDecision.ignore) {
          const updated = await markComplianceAsIgnored({
            compliance_id: row.id,
            reason: skipDecision.reason,
            source: "SCHEDULER",
          });
          if (updated) {
            ignored += 1;
          }
          continue;
        }

        const updated = await db.sequelize.transaction(
          async (transactionContext) => {
            const missedCompliance = await markComplianceAsMissed({
              compliance_id: row.id,
              reason: DEFAULT_MISSED_REASON,
              source: "SCHEDULER",
              transaction: transactionContext,
            });

            if (!missedCompliance) {
              return null;
            }

            await clearLeadFollowUpDateForMissedCompliance(row, {
              transaction: transactionContext,
            });

            return missedCompliance;
          },
        );

        if (updated) {
          missed += 1;
        }
      } catch (err) {
        logComplianceError("processDuePendingComplianceBatch:item", err, {
          compliance_id: row?.id,
          client_id: row?.client_id,
          call_id: row?.call_id,
        });
      }
    }

    return {
      processed: dueRows.length,
      called,
      missed,
      ignored,
    };
  } catch (err) {
    logComplianceError("processDuePendingComplianceBatch", err);
    return { processed: 0, called: 0, missed: 0, ignored: 0 };
  }
};

const buildComplianceFilters = (filters = {}) => {
  const where = {};
  const clientId = filters?.client_id ?? null;
  const normalizedStatus = String(filters?.compliance_status || "")
    .trim()
    .toUpperCase();
  const normalizedAgent = String(filters?.agent_name || "").trim();
  const normalizedFrom = String(filters?.from || "").trim();
  const normalizedTo = String(filters?.to || "").trim();

  if (clientId) {
    where.client_id = clientId;
  }

  if (normalizedStatus) {
    where.compliance_status = normalizedStatus;
  }

  if (normalizedAgent) {
    where.agent_name = normalizedAgent;
  }

  const dateConditions = [];
  if (normalizedFrom || normalizedTo) {
    const range = {};
    if (normalizedFrom) {
      range[Op.gte] = normalizedFrom;
    }
    if (normalizedTo) {
      range[Op.lte] = normalizedTo;
    }
    dateConditions.push({ scheduled_follow_up_date: range });
    dateConditions.push({ scheduled_follow_up_at: range });
    where[Op.or] = dateConditions;
  }

  return where;
};

const buildComplianceRowAttributes = [
  "id",
  "lead_id",
  "call_id",
  "phone_number",
  "normalized_phone_number",
  "customer_name",
  "agent_name",
  "scheduled_follow_up_date",
  "scheduled_follow_up_at",
  "allowed_until",
  "compliance_status",
  "matched_call_log_id",
  "matched_call_id",
  "matched_call_started_at",
  "reason",
  "source",
  "createdAt",
  "updatedAt",
];

const resolveComplianceTenantWhere = (tenant) => {
  if (!tenant?.isSuperAdmin) {
    return { client_id: tenant?.id };
  }

  return {};
};

export const listFollowUpCallCompliance = async ({
  tenant,
  filters = {},
} = {}) => {
  try {
    const where = {
      ...resolveComplianceTenantWhere(tenant),
      ...buildComplianceFilters(filters),
    };

    const limit = Number.isFinite(Number(filters?.limit))
      ? Math.max(parseInt(filters.limit, 10), 1)
      : 100;

    const rows = await db.PixelEyeFollowUpCallCompliance.findAll({
      where,
      attributes: buildComplianceRowAttributes,
      order: [
        ["scheduled_follow_up_at", "DESC"],
        ["allowed_until", "DESC"],
        ["created_at", "DESC"],
      ],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      lead_id: row.lead_id,
      call_id: row.call_id,
      phone_number: row.phone_number,
      normalized_phone_number: row.normalized_phone_number,
      customer_name: row.customer_name,
      agent_name: row.agent_name,
      scheduled_follow_up_date: row.scheduled_follow_up_date,
      scheduled_follow_up_at: row.scheduled_follow_up_at,
      allowed_until: row.allowed_until,
      compliance_status: row.compliance_status,
      matched_call_log_id: row.matched_call_log_id,
      matched_call_id: row.matched_call_id,
      matched_call_started_at: row.matched_call_started_at,
      reason: row.reason,
      source: row.source,
      created_at: row.createdAt ?? row.created_at,
      updated_at: row.updatedAt ?? row.updated_at,
    }));
  } catch (err) {
    logComplianceError("listFollowUpCallCompliance", err, {
      client_id: tenant?.id,
    });
    return [];
  }
};

export const listMissedFollowUpCalls = async ({
  tenant,
  filters = {},
} = {}) => {
  return await listFollowUpCallCompliance({
    tenant,
    filters: {
      ...filters,
      compliance_status: "MISSED",
    },
  });
};

export const getFollowUpCallComplianceSummary = async ({
  tenant,
  filters = {},
} = {}) => {
  try {
    const where = {
      ...resolveComplianceTenantWhere(tenant),
      ...buildComplianceFilters(filters),
    };

    const rows = await db.PixelEyeFollowUpCallCompliance.findAll({
      where,
      attributes: [
        "compliance_status",
        [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
      ],
      group: ["compliance_status"],
      raw: true,
    });

    const summary = {
      total: 0,
      pending: 0,
      called: 0,
      missed: 0,
      ignored: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      const status = String(row.compliance_status || "")
        .trim()
        .toLowerCase();
      const count = Number(row.count || 0);
      if (!Number.isFinite(count)) continue;

      summary.total += count;
      if (status === "pending") summary.pending += count;
      if (status === "called") summary.called += count;
      if (status === "missed") summary.missed += count;
      if (status === "ignored") summary.ignored += count;
      if (status === "cancelled") summary.cancelled += count;
    }

    return summary;
  } catch (err) {
    logComplianceError("getFollowUpCallComplianceSummary", err, {
      client_id: tenant?.id,
    });
    return {
      total: 0,
      pending: 0,
      called: 0,
      missed: 0,
      ignored: 0,
      cancelled: 0,
    };
  }
};

