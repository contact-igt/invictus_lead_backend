import db from "../../database/index.js";
import { tenantSafe } from "../../utils/tenantContext.js";
import { Op, col, fn, where } from "sequelize";
import { normalizePixelEyePhoneNumber } from "./pixelEyePhoneNumber.js";
import {
  processLeadStatus,
  processDayStatus,
  scheduleManualFollowUpReminder,
  isTerminalLeadStatus,
  resolveManualFollowUpScheduledAt,
} from "./pixelEyeNotification.service.js";
import {
  getAllowedStatusesForDay,
  isTerminalPixelEyeStatus,
  normalizePixelEyeMainStatus,
  normalizePixelEyeOutcomeStatus,
} from "./pixelEyeStatusPolicy.js";
import {
  createFollowUpHistoryEntry,
  getFollowUpHistoryForLead,
  getFollowUpChangeSummaryForLead,
  getFollowUpChangeSummaryMapForLeads,
} from "./pixelEyeFollowUpHistory.service.js";
import {
  createOrUpdatePendingFollowUpCompliance,
  cancelPendingFollowUpComplianceForLead,
  getPendingFollowUpComplianceForLead,
  markPendingFollowUpComplianceCalledForLead,
} from "./pixelEyeFollowUpCallCompliance.service.js";
import { createPixelEyeCallLog } from "./pixelEyeCallLog.service.js";

const buildDateRangeFilter = (dateFrom, dateTo) => {
  if (dateFrom && dateTo) return { [Op.between]: [dateFrom, dateTo] };
  if (dateFrom) return { [Op.gte]: dateFrom };
  if (dateTo) return { [Op.lte]: dateTo };
  return null;
};

const buildLeadFilters = ({ dateFrom, dateTo, agent, status, search } = {}) => {
  const filters = {};

  const normalizedDateFrom = String(dateFrom || "").trim();
  const normalizedDateTo = String(dateTo || "").trim();
  const normalizedAgent = String(agent || "").trim();
  const normalizedStatus = String(status || "").trim();
  const normalizedSearch = String(search || "").trim();

  const dateRangeFilter = buildDateRangeFilter(
    normalizedDateFrom,
    normalizedDateTo,
  );
  if (dateRangeFilter) {
    filters[Op.and] = [
      {
        [Op.or]: [
          { date: dateRangeFilter },
          {
            [Op.and]: [
              { date: null },
              where(fn("DATE", col("created_at")), dateRangeFilter),
            ],
          },
        ],
      },
    ];
  }

  if (normalizedAgent) {
    filters.agent_name = normalizedAgent;
  }

  if (normalizedStatus) {
    filters.status = normalizedStatus;
  }

  if (normalizedSearch) {
    filters[Op.or] = [
      { customer_name: { [Op.like]: `%${normalizedSearch}%` } },
      { phone_number: { [Op.like]: `%${normalizedSearch}%` } },
      { agent_name: { [Op.like]: `%${normalizedSearch}%` } },
      { source: { [Op.like]: `%${normalizedSearch}%` } },
      { type_of_enquiry: { [Op.like]: `%${normalizedSearch}%` } },
      { status: { [Op.like]: `%${normalizedSearch}%` } },
      { call_id: { [Op.like]: `%${normalizedSearch}%` } },
    ];
  }

  return filters;
};

const normalizePhone = (phone) => normalizePixelEyePhoneNumber(phone);

const normalizeLeadPhone = (phone) => normalizePixelEyePhoneNumber(phone);

const buildClientCallKey = (clientId, callId, leadId = null) =>
  leadId
    ? `${clientId}:lead:${String(leadId).trim()}`
    : `${clientId}:call:${String(callId || "").trim()}`;

const attachReminderState = (lead, reminderState, historySummary = {}) => ({
  ...lead.toJSON(),
  followup_state: reminderState?.state ?? null,
  followup_completion_source: reminderState?.completion_source ?? null,
  reminder_schedule_type: reminderState?.schedule_type ?? null,
  reminder_scheduled_at: reminderState?.scheduled_at ?? null,
  reminder_notification_sent: reminderState?.notification_sent ?? null,
  reminder_notification_sent_at: reminderState?.notification_sent_at ?? null,
  reminder_reason: reminderState?.reason ?? null,
  reminder_permanently_closed: reminderState?.permanently_closed ?? null,
  reminder_cancel_reason: reminderState?.cancel_reason ?? null,
  follow_up_change_count: Number(historySummary?.count || 0),
  latest_follow_up_change_at:
    historySummary?.latest_follow_up_change_at ?? null,
});

const DAY_FIELDS = ["day_1", "day_2", "day_3", "day_4", "day_5"];
const NORMAL_LEAD_ATTENTION_STATE = "SAME_NUMBER_OUTCOME_PENDING";
const NORMAL_LEAD_ATTENTION_LABEL = "Repeat Caller - Update Outcome";

const hasIncompleteOutcomeDays = (lead) =>
  DAY_FIELDS.some((field) => isBlank(lead?.[field]));

const getRawPayloadObject = (callLog) => {
  if (!callLog) return null;

  const raw = callLog.raw_payload;
  if (!raw) return null;
  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
};

const isPendingNormalLeadAttentionCallLog = (callLog) => {
  if (!callLog || callLog.outcome_applied_at) {
    return false;
  }

  const rawPayload = getRawPayloadObject(callLog);
  const attentionState = String(rawPayload?.attention_state || "")
    .trim()
    .toUpperCase();

  return attentionState === NORMAL_LEAD_ATTENTION_STATE;
};

const getNormalLeadAttentionFromCallLog = (callLog) => {
  if (!isPendingNormalLeadAttentionCallLog(callLog)) {
    return {
      normal_lead_attention_state: null,
      normal_lead_attention_label: null,
      needs_manual_day_outcome: false,
      normal_lead_attention_at: null,
    };
  }

  const rawPayload = getRawPayloadObject(callLog);
  return {
    normal_lead_attention_state: NORMAL_LEAD_ATTENTION_STATE,
    normal_lead_attention_label:
      String(rawPayload?.attention_label || "").trim() ||
      NORMAL_LEAD_ATTENTION_LABEL,
    needs_manual_day_outcome: true,
    normal_lead_attention_at:
      rawPayload?.attention_created_at ||
      callLog?.created_at ||
      callLog?.createdAt ||
      null,
  };
};

const getFollowUpHighlightState = (lead, reminderState, complianceRow) => {
  const complianceStatus = String(complianceRow?.compliance_status || "")
    .trim()
    .toUpperCase();

  if (
    complianceStatus !== "CALLED" ||
    !String(lead?.follow_up_date || "").trim() ||
    !hasIncompleteOutcomeDays(lead) ||
    isTerminalPixelEyeLeadValue(lead?.status) ||
    isClosedFollowUpFlowState(reminderState)
  ) {
    return null;
  }

  return "CALL_RECEIVED_OUTCOME_PENDING";
};

const attachFollowUpState = (
  lead,
  reminderState,
  complianceRow,
  normalLeadAttentionCallLog,
  historySummary = {},
) => {
  const highlightState = getFollowUpHighlightState(
    lead,
    reminderState,
    complianceRow,
  );

  return {
    ...attachReminderState(lead, reminderState, historySummary),
    followup_highlight_state: highlightState,
    called_outcome_missing: Boolean(highlightState),
    compliance_status: complianceRow?.compliance_status ?? null,
    matched_call_log_id: complianceRow?.matched_call_log_id ?? null,
    matched_call_id: complianceRow?.matched_call_id ?? null,
    matched_call_started_at: complianceRow?.matched_call_started_at ?? null,
    ...getNormalLeadAttentionFromCallLog(normalLeadAttentionCallLog),
  };
};

const resolvePendingNormalLeadAttentionCallLog = async (lead, options = {}) => {
  if (!lead?.client_id) {
    return null;
  }

  const identityClauses = [];
  if (lead?.id) {
    identityClauses.push({ lead_id: lead.id });
  }
  if (lead?.call_id) {
    identityClauses.push({ call_id: lead.call_id });
  }

  if (identityClauses.length === 0) {
    return null;
  }

  const logs = await db.PixelEyeCallLog.findAll({
    where: {
      client_id: lead.client_id,
      [Op.or]: identityClauses,
    },
    order: [
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  });

  return logs.find((row) => isPendingNormalLeadAttentionCallLog(row)) || null;
};

const resolveNormalLeadAttentionCallLogMap = (callLogs = []) => {
  const map = new Map();

  for (const row of callLogs) {
    if (!isPendingNormalLeadAttentionCallLog(row)) {
      continue;
    }

    const key = buildClientCallKey(row.client_id, row.call_id, row.lead_id);
    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return map;
};

const resolveNormalLeadAttentionCallLogsForLeads = async (
  leads,
  scopedTenant,
) => {
  const leadIds = leads
    .map((lead) => lead?.id)
    .filter((id) => Number.isFinite(Number(id)));
  const callIds = leads
    .map((lead) => String(lead?.call_id || "").trim())
    .filter((callId) => Boolean(callId));

  if (leadIds.length === 0 && callIds.length === 0) {
    return [];
  }

  const identityClauses = [];
  if (leadIds.length > 0) {
    identityClauses.push({ lead_id: { [Op.in]: leadIds } });
  }
  if (callIds.length > 0) {
    identityClauses.push({ call_id: { [Op.in]: callIds } });
  }

  return await db.PixelEyeCallLog.findAll({
    where: {
      ...(scopedTenant?.isSuperAdmin ? {} : { client_id: scopedTenant?.id }),
      [Op.or]: identityClauses,
    },
    order: [
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
  });
};

const markNormalLeadAttentionResolved = async (
  lead,
  normalizedStatus,
  transaction = null,
) => {
  const pendingCallLog = await resolvePendingNormalLeadAttentionCallLog(lead, {
    transaction,
  });

  if (!pendingCallLog) {
    return null;
  }

  const rawPayload = getRawPayloadObject(pendingCallLog) || {};
  const nowIso = new Date().toISOString();

  return await pendingCallLog.update(
    {
      outcome_status: normalizedStatus,
      outcome_applied_at: new Date(),
      raw_payload: {
        ...rawPayload,
        attention_state: NORMAL_LEAD_ATTENTION_STATE,
        attention_label:
          String(rawPayload.attention_label || "").trim() ||
          NORMAL_LEAD_ATTENTION_LABEL,
        attention_resolved_at: nowIso,
        attention_resolved_via: "FOLLOW_UP_OUTCOME",
      },
    },
    {
      ...(transaction ? { transaction } : {}),
    },
  );
};

const createManualSameNumberAttentionCallLog = async (lead, data = {}) => {
  if (!lead?.client_id || !lead?.id) {
    return null;
  }

  const attentionCreatedAt = new Date().toISOString();

  return await createPixelEyeCallLog({
    client_id: lead.client_id,
    lead_id: lead.id,
    call_id: data.call_id || lead.call_id,
    phone_number: data.phone_number || lead.phone_number,
    customer_name: data.customer_name || lead.customer_name,
    agent_name: data.agent_name || lead.agent_name,
    date: data.date || lead.date,
    time: data.time || lead.time,
    status: data.status || lead.status,
    source: "MANUAL_CREATE",
    raw_payload: {
      source: "MANUAL_CREATE",
      attention_state: NORMAL_LEAD_ATTENTION_STATE,
      attention_label: NORMAL_LEAD_ATTENTION_LABEL,
      attention_source: "MANUAL_CREATE",
      attention_created_at: attentionCreatedAt,
    },
  });
};

const hasOwnValue = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === "";

const getFollowUpDateFingerprint = (value) => {
  if (isBlank(value)) {
    return null;
  }

  try {
    return resolveManualFollowUpScheduledAt(value).toISOString();
  } catch (err) {
    return String(value).trim();
  }
};

const isSameFollowUpDate = (currentValue, nextValue) =>
  getFollowUpDateFingerprint(currentValue) ===
  getFollowUpDateFingerprint(nextValue);

const normalizeLeadNotes = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const COMPLETED_FOLLOW_UP_STATES = new Set(["cancelled", "completed"]);

const getLatestReminderStateForLead = async (lead, options = {}) => {
  if (!lead?.client_id) {
    return null;
  }

  const identityClauses = [];

  if (lead?.id) {
    identityClauses.push({ lead_id: lead.id });
  }

  if (!lead?.id && lead?.normalized_phone_number) {
    identityClauses.push({
      normalized_phone_number: lead.normalized_phone_number,
    });
  }

  if (lead?.call_id) {
    identityClauses.push({ call_id: lead.call_id });
  }

  if (identityClauses.length === 0) {
    return null;
  }

  return await db.PixelEyeLeadState.findOne({
    where: {
      client_id: lead.client_id,
      [Op.or]: identityClauses,
    },
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  });
};

const isClosedFollowUpFlowState = (reminderState) => {
  if (!reminderState) return false;

  if (reminderState.permanently_closed) {
    return true;
  }

  const state = String(reminderState.state || "")
    .trim()
    .toLowerCase();
  if (state === "cancelled") {
    return true;
  }

  if (state !== "completed") {
    return false;
  }

  const completionSource = String(reminderState.completion_source || "")
    .trim()
    .toLowerCase();
  return completionSource !== "notification_sent";
};

const hasAllFollowUpDaysFilled = (lead) =>
  DAY_FIELDS.every((field) => !isBlank(lead?.[field]));

const getLatestFollowUpDayValue = (lead) => {
  for (let index = DAY_FIELDS.length - 1; index >= 0; index -= 1) {
    const value = lead?.[DAY_FIELDS[index]];
    if (!isBlank(value)) {
      return value;
    }
  }

  return null;
};

const isTerminalPixelEyeLeadValue = (value) =>
  isTerminalPixelEyeStatus(value) || isClosedFollowUpOutcome(value);

/**
 * Checks if a PixelEye lead is currently in an active follow-up lifecycle.
 * Decision Logic (as per business rules):
 * Completed if:
 *  - day_1 to day_5 are all filled
 *  - OR status is terminal/closed
 *  - OR reminder/follow-up is permanently closed/cancelled
 * Active if NOT completed.
 */
export const isPixelEyeLeadActive = async (lead) => {
  if (!lead) return false;

  // 1. Check day slots completion
  if (hasAllFollowUpDaysFilled(lead)) return false;

  // 2. Check terminal status (Closed, Visited, Not interested, etc.)
  if (isTerminalPixelEyeLeadValue(lead.status)) {
    return false;
  }

  const latestDayValue = getLatestFollowUpDayValue(lead);
  if (isTerminalPixelEyeLeadValue(latestDayValue)) {
    return false;
  }

  // 3. Check reminder state context
  const reminderState = await getLatestReminderStateForLead(lead);

  if (isClosedFollowUpFlowState(reminderState)) {
    return false;
  }

  // If none of the terminal/closure conditions match and there are empty slots,
  // the lead is considered active.
  return true;
};

const getDayFieldIndex = (field) => DAY_FIELDS.indexOf(field);

const getValueFromUpdateOrLead = (updateData, lead, field) => {
  if (hasOwnValue(updateData, field)) {
    return updateData[field];
  }

  return lead?.[field];
};

const assertDayUpdateAllowed = (lead, updateData, options = {}) => {
  const allowTerminalLeadStatus = Boolean(options?.allowTerminalLeadStatus);
  const changedDayFields = DAY_FIELDS.filter((field) =>
    hasOwnValue(updateData, field),
  );
  if (changedDayFields.length === 0) {
    return;
  }

  const nextMainStatus = getValueFromUpdateOrLead(updateData, lead, "status");

  // 1. Lead must have an initial status set
  if (isBlank(nextMainStatus)) {
    throw new Error(
      "Cannot update follow-up days because lead status is not set.",
    );
  }

  // 2. Main status cannot be terminal
  if (!allowTerminalLeadStatus && isTerminalLeadStatus(nextMainStatus)) {
    throw new Error(
      "Cannot update follow-up days because lead status is already closed/terminal.",
    );
  }

  for (const changedDayField of changedDayFields) {
    const dayIndex = getDayFieldIndex(changedDayField);
    const dayNumber = dayIndex + 1;
    const nextDayValue = getValueFromUpdateOrLead(
      updateData,
      lead,
      changedDayField,
    );

    if (!isBlank(nextDayValue)) {
      const normalizedDayValue = normalizePixelEyeOutcomeStatus(nextDayValue);
      updateData[changedDayField] = normalizedDayValue;
      const allowedStatuses = getAllowedStatusesForDay(dayNumber);
      if (!allowedStatuses.includes(normalizedDayValue)) {
        throw new Error(`Selected status is not allowed for Day ${dayNumber}.`);
      }
    }

    for (let i = 0; i < dayIndex; i += 1) {
      const priorDayField = DAY_FIELDS[i];
      const priorDayValue = getValueFromUpdateOrLead(
        updateData,
        lead,
        priorDayField,
      );

      // 3. Prior day(s) must be set
      if (isBlank(priorDayValue)) {
        throw new Error(
          `Cannot update ${changedDayField.replace("_", " ")} because prior day(s) (specifically ${priorDayField.replace("_", " ")}) are not set.`,
        );
      }

      // 4. Prior day(s) cannot be terminal
      if (isTerminalLeadStatus(priorDayValue)) {
        throw new Error(
          "Cannot update next follow-up day because previous day is already closed/terminal.",
        );
      }
    }
  }
};

const getManualFollowUpScheduledAt = (followUpDate) => {
  const scheduledAt = resolveManualFollowUpScheduledAt(followUpDate);
  if (!scheduledAt) {
    throw new Error("Invalid follow_up_date");
  }

  if (scheduledAt.getTime() <= Date.now()) {
    throw new Error("follow_up_date must be in the future");
  }

  return scheduledAt;
};

const scheduleManualFollowUpIfEligible = async (
  lead,
  followUpDate,
  options = {},
) => {
  if (!hasOwnValue(options, "follow_up_date")) {
    return false;
  }

  if (isBlank(followUpDate)) {
    console.log(
      `[PixelEye] Skipped manual follow-up scheduling for call_id=${lead?.call_id}: missing follow_up_date`,
    );
    return false;
  }

  if (!lead?.client_id || !lead?.call_id) {
    console.log(
      `[PixelEye] Skipped manual follow-up scheduling: missing client_id or call_id`,
    );
    return false;
  }

  if (isTerminalLeadStatus(lead?.status)) {
    console.log(
      `[PixelEye] Skipped manual follow-up scheduling for call_id=${lead?.call_id}: terminal status=${lead?.status}`,
    );
    return false;
  }

  let scheduledAt;
  try {
    scheduledAt = getManualFollowUpScheduledAt(followUpDate);
  } catch (err) {
    console.log(
      `[PixelEye] Skipped manual follow-up scheduling for call_id=${lead?.call_id}: ${err.message}`,
    );
    throw err;
  }

  await scheduleManualFollowUpReminder(lead, scheduledAt, {
    clientId: lead.client_id,
    callId: lead.call_id,
    reason:
      String(options.reason || "Manual Follow-up Reminder").trim() ||
      "Manual Follow-up Reminder",
  });

  console.log(
    `[PixelEye] Manual follow-up scheduled for call_id=${lead?.call_id} at ${scheduledAt.toISOString()}`,
  );

  return true;
};

const persistPendingFollowUpCompliance = async ({
  lead,
  followUpDate,
  source,
  reason,
}) => {
  const compliance = await createOrUpdatePendingFollowUpCompliance({
    client_id: lead?.client_id,
    lead_id: lead?.id,
    call_id: lead?.call_id,
    phone_number: lead?.phone_number,
    customer_name: lead?.customer_name,
    agent_name: lead?.agent_name,
    follow_up_date: followUpDate,
    source,
    reason,
  });

  if (!compliance) {
    console.error(
      `[PixelEye] Failed to create/update pending compliance for call_id=${lead?.call_id || "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}`,
    );
  }

  return compliance;
};

export const reschedulePixelEyeFollowUp = async (
  id,
  tenantContext,
  data = {},
  actor = {},
) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });

  if (!lead) throw new Error("Lead not found or unauthorized");

  const existingState = await getLatestReminderStateForLead(lead);

  if (
    isTerminalLeadStatus(lead.status) ||
    isClosedFollowUpFlowState(existingState)
  ) {
    throw new Error("Cannot reschedule a closed lead.");
  }

  const oldFollowUpDate = lead.follow_up_date;
  const followUpDate = String(data.follow_up_date || "").trim();
  if (!followUpDate) {
    throw new Error("follow_up_date is required");
  }

  const scheduledAt = getManualFollowUpScheduledAt(followUpDate);
  const reason =
    String(data.reason || "Follow-up rescheduled").trim() ||
    "Follow-up rescheduled";

  const updatedLead = await lead.update({
    follow_up_date: scheduledAt.toISOString(),
  });

  await cancelPendingFollowUpComplianceForLead({
    client_id: updatedLead.client_id,
    lead_id: updatedLead.id,
    reason: "Superseded by updated follow-up date",
    source: actor?.source || "FRONTEND",
  });

  const reminderState = await scheduleManualFollowUpReminder(
    updatedLead,
    scheduledAt,
    {
      clientId: updatedLead.client_id,
      callId: updatedLead.call_id,
      reason,
    },
  );

  await persistPendingFollowUpCompliance({
    lead: updatedLead,
    followUpDate: updatedLead.follow_up_date ?? scheduledAt.toISOString(),
    source: actor?.source || "FRONTEND",
    reason: "Pending follow-up call check",
  });

  await createFollowUpHistoryEntry({
    client_id: updatedLead.client_id,
    lead_id: updatedLead.id,
    call_id: updatedLead.call_id,
    phone_number: updatedLead.phone_number,
    customer_name: updatedLead.customer_name,
    old_follow_up_date: oldFollowUpDate,
    new_follow_up_date: updatedLead.follow_up_date ?? scheduledAt.toISOString(),
    change_type: "RESCHEDULED",
    source: "FRONTEND",
    reason,
    changed_by_user_id: actor?.changed_by_user_id ?? null,
    changed_by_name: actor?.changed_by_name ?? null,
  });

  console.log(
    `[PixelEye] Rescheduled follow-up for call_id=${updatedLead.call_id} to ${scheduledAt.toISOString()}`,
  );

  return {
    lead: updatedLead,
    reminderState,
  };
};

const CLOSE_OUTCOME_SET = new Set([
  "appointment fixed",
  "doctor appointment fixed",
  "walk in",
  "visited",
  "not interested",
  "closed",
  "wrong number",
  "number not in service",
  "not in hospital city",
  "far from hospital",
  "going to other hospital",
  "not willing to come as of now",
]);

const isClosedFollowUpOutcome = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    Boolean(normalized) &&
    (isTerminalLeadStatus(normalized) || CLOSE_OUTCOME_SET.has(normalized))
  );
};

const serializeReminderStateSnapshot = (state) => {
  if (!state) return null;

  return {
    id: state.id ?? null,
    state: state.state ?? null,
    schedule_type: state.schedule_type ?? null,
    scheduled_at: state.scheduled_at ?? null,
    notification_sent: state.notification_sent ?? false,
    notification_sent_at: state.notification_sent_at ?? null,
    completion_source: state.completion_source ?? null,
    permanently_closed: state.permanently_closed ?? false,
    cancel_reason: state.cancel_reason ?? null,
    current_day: state.current_day ?? null,
    reason: state.reason ?? null,
  };
};

const serializeComplianceSnapshot = (row) => ({
  id: row.id ?? null,
  compliance_status: row.compliance_status ?? null,
  scheduled_follow_up_date: row.scheduled_follow_up_date ?? null,
  scheduled_follow_up_at: row.scheduled_follow_up_at ?? null,
  allowed_until: row.allowed_until ?? null,
  reason: row.reason ?? null,
  source: row.source ?? null,
});

export const cancelPixelEyeFollowUp = async (
  id,
  tenantContext,
  data = {},
  actor = {},
) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);

  return await db.sequelize.transaction(async (transaction) => {
    const lead = await safeModel.findOne({
      where: { id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!lead) {
      throw new Error("Lead not found or unauthorized");
    }

    const nextStatus = String(data.status || "").trim();
    const cancelReason =
      String(data.reason || nextStatus || "Follow-up cancelled").trim() ||
      "Follow-up cancelled";
    const shouldPermanentlyClose =
      isClosedFollowUpOutcome(nextStatus) ||
      isClosedFollowUpOutcome(cancelReason);
    const oldFollowUpDate = lead.follow_up_date ?? null;

    const existingState = await getLatestReminderStateForLead(lead, {
      transaction,
    });
    const previousReminder = serializeReminderStateSnapshot(existingState);
    const pendingComplianceRows = await getPendingFollowUpComplianceForLead({
      client_id: lead.client_id,
      lead_id: lead.id,
      transaction,
      throwOnError: true,
    });
    const previousCompliance = pendingComplianceRows.map(
      serializeComplianceSnapshot,
    );

    const updateData = {};
    if (nextStatus) {
      updateData.status = nextStatus;
    }
    if (!isBlank(oldFollowUpDate)) {
      updateData.follow_up_date = null;
    }

    const updatedLead =
      Object.keys(updateData).length > 0
        ? await lead.update(updateData, { transaction })
        : lead;

    const cancelledComplianceCount =
      await cancelPendingFollowUpComplianceForLead({
        client_id: updatedLead.client_id,
        lead_id: updatedLead.id,
        reason: cancelReason,
        source: actor?.source || "SYSTEM",
        transaction,
        throwOnError: true,
      });
    const cancelledComplianceIds = previousCompliance.map((row) => row.id);

    let reminderState = null;
    if (existingState) {
      reminderState = await existingState.update(
        {
          lead_id: updatedLead.id ?? existingState.lead_id ?? null,
          state: "cancelled",
          schedule_type: null,
          reason: null,
          scheduled_at: null,
          notification_sent: false,
          notification_sent_at: null,
          permanently_closed: shouldPermanentlyClose,
          cancel_reason: cancelReason,
          completion_source: null,
          current_day: null,
          last_status: updatedLead.status ?? existingState.last_status ?? null,
          customer_name:
            updatedLead.customer_name ?? existingState.customer_name ?? null,
          phone_number:
            updatedLead.phone_number ?? existingState.phone_number ?? null,
          normalized_phone_number:
            updatedLead.normalized_phone_number ||
            normalizeLeadPhone(updatedLead.phone_number) ||
            existingState.normalized_phone_number ||
            null,
          agent_name:
            updatedLead.agent_name ?? existingState.agent_name ?? null,
        },
        { transaction },
      );
    } else {
      reminderState = await db.PixelEyeLeadState.create(
        {
          client_id: updatedLead.client_id,
          lead_id: updatedLead.id ?? null,
          call_id: updatedLead.call_id,
          customer_name: updatedLead.customer_name ?? null,
          phone_number: updatedLead.phone_number ?? null,
          normalized_phone_number:
            updatedLead.normalized_phone_number ||
            normalizeLeadPhone(updatedLead.phone_number) ||
            null,
          agent_name: updatedLead.agent_name ?? null,
          last_status: updatedLead.status ?? null,
          state: "cancelled",
          schedule_type: null,
          reason: null,
          scheduled_at: null,
          notification_sent: false,
          notification_sent_at: null,
          permanently_closed: shouldPermanentlyClose,
          cancel_reason: cancelReason,
          current_day: null,
        },
        { transaction },
      );
    }

    const shouldWriteHistory =
      !isBlank(oldFollowUpDate) ||
      previousCompliance.length > 0 ||
      String(previousReminder?.state || "").toLowerCase() === "scheduled";

    if (shouldWriteHistory) {
      const historyEntry = await createFollowUpHistoryEntry({
        client_id: updatedLead.client_id,
        lead_id: updatedLead.id,
        call_id: updatedLead.call_id,
        phone_number: updatedLead.phone_number,
        customer_name: updatedLead.customer_name,
        old_follow_up_date: oldFollowUpDate,
        new_follow_up_date: null,
        change_type: "CLEARED",
        source: actor?.source || "SYSTEM",
        reason: "Follow-up cancelled",
        changed_by_user_id: actor?.changed_by_user_id ?? null,
        changed_by_name: actor?.changed_by_name ?? null,
        metadata: {
          action: "FOLLOW_UP_CANCELLED",
          old_follow_up_date: oldFollowUpDate,
          new_follow_up_date: null,
          prev_reminder: previousReminder,
          new_reminder: serializeReminderStateSnapshot(reminderState),
          prev_compliance: previousCompliance,
          cancelled_compliance_ids: cancelledComplianceIds,
          cancelled_compliance_count: cancelledComplianceCount,
          source: actor?.source === "FRONTEND" ? "MANUAL" : "SYSTEM",
          reason: "Follow-up cancelled",
        },
        transaction,
      });

      if (!historyEntry) {
        throw new Error("Failed to create follow-up cancellation history");
      }
    }

    console.log(
      `[PixelEye] Cancelled follow-up for call_id=${updatedLead.call_id}` +
        (existingState
          ? ` permanently_closed=${shouldPermanentlyClose}`
          : " (no active reminder row found)"),
    );

    return {
      lead: updatedLead,
      reminderState,
      hadReminder: Boolean(existingState),
      cancelledComplianceCount,
      cancelledComplianceIds,
    };
  });
};

const buildTenantContextWithClientId = (tenantContext, clientId) => {
  if (!clientId) return tenantContext;
  return {
    ...tenantContext,
    id: clientId,
    isSuperAdmin: false,
  };
};

export const listPixelEyeLeads = async (tenantContext, clientId) => {
  const scopedTenant = buildTenantContextWithClientId(tenantContext, clientId);
  const scopedClientId =
    clientId || (tenantContext?.isSuperAdmin ? null : tenantContext?.id);
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const leads = await safeModel.findAll({
    where: scopedClientId ? { client_id: scopedClientId } : undefined,
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  const reminderWhere = scopedTenant?.isSuperAdmin
    ? {}
    : { client_id: scopedTenant?.id };

  const reminderStates = await db.PixelEyeLeadState.findAll({
    where: reminderWhere,
    order: [["updatedAt", "DESC"]],
  });

  const reminderStateMap = new Map();
  for (const state of reminderStates) {
    const key = buildClientCallKey(
      state.client_id,
      state.call_id,
      state.lead_id,
    );
    if (!reminderStateMap.has(key)) {
      reminderStateMap.set(key, state);
    }
  }

  const historySummaryMap = await getFollowUpChangeSummaryMapForLeads(leads);

  const complianceRows = await db.PixelEyeFollowUpCallCompliance.findAll({
    where: scopedTenant?.isSuperAdmin ? {} : { client_id: scopedTenant?.id },
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  const complianceStateMap = new Map();
  for (const row of complianceRows) {
    const key = buildClientCallKey(row.client_id, row.call_id, row.lead_id);
    if (!complianceStateMap.has(key)) {
      complianceStateMap.set(key, row);
    }
  }

  const attentionCallLogs = await resolveNormalLeadAttentionCallLogsForLeads(
    leads,
    scopedTenant,
  );
  const attentionCallLogMap =
    resolveNormalLeadAttentionCallLogMap(attentionCallLogs);

  return leads.map((lead) =>
    attachFollowUpState(
      lead,
      reminderStateMap.get(
        buildClientCallKey(lead.client_id, lead.call_id, lead.id),
      ),
      complianceStateMap.get(
        buildClientCallKey(lead.client_id, lead.call_id, lead.id),
      ),
      attentionCallLogMap.get(
        buildClientCallKey(lead.client_id, lead.call_id, lead.id),
      ),
      getFollowUpChangeSummaryForLead(historySummaryMap, lead),
    ),
  );
};

export const listPixelEyeLeadsForExport = async (
  tenantContext,
  queryFilters = {},
  clientId,
) => {
  const scopedClientId =
    clientId || (tenantContext?.isSuperAdmin ? null : tenantContext?.id);
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const whereFilters = buildLeadFilters(queryFilters);
  if (scopedClientId) {
    whereFilters.client_id = scopedClientId;
  }

  return await safeModel.findAll({
    where: whereFilters,
    order: [
      ["date", "ASC"],
      ["time", "ASC"],
      ["id", "ASC"],
    ],
  });
};

export const getPixelEyeLead = async (id, tenantContext) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });
  if (!lead) return null;

  const reminderState = await getLatestReminderStateForLead(lead);

  const complianceRow = await db.PixelEyeFollowUpCallCompliance.findOne({
    where: {
      client_id: lead.client_id,
      [Op.or]: [
        ...(lead.id ? [{ lead_id: lead.id }] : []),
        ...(lead.call_id ? [{ call_id: lead.call_id }] : []),
      ],
    },
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  const historySummaryRows = await getFollowUpHistoryForLead({
    client_id: lead.client_id,
    lead_id: lead.id,
    call_id: lead.call_id,
  });

  const historySummary = {
    count: historySummaryRows?.length || 0,
    latest_follow_up_change_at:
      historySummaryRows?.[0]?.createdAt ??
      historySummaryRows?.[0]?.created_at ??
      null,
  };

  const normalLeadAttentionCallLog =
    await resolvePendingNormalLeadAttentionCallLog(lead);

  return attachFollowUpState(
    lead,
    reminderState,
    complianceRow,
    normalLeadAttentionCallLog,
    historySummary,
  );
};

export const createPixelEyeLead = async (data, clientId, actor = {}) => {
  const normalizedPhoneNumber = normalizeLeadPhone(data.phone_number);
  if (!normalizedPhoneNumber) {
    throw new Error("Invalid phone number");
  }

  const createData = { ...data };
  if (hasOwnValue(createData, "status")) {
    createData.status = normalizePixelEyeMainStatus(createData.status);
  }
  if (hasOwnValue(createData, "notes")) {
    createData.notes = normalizeLeadNotes(createData.notes);
  }
  for (const field of DAY_FIELDS) {
    delete createData[field];
  }

  if (
    hasOwnValue(createData, "follow_up_date") &&
    !isBlank(createData.follow_up_date)
  ) {
    getManualFollowUpScheduledAt(createData.follow_up_date);
  }

  const lead = await db.PixelEye.create({
    ...createData,
    client_id: clientId,
    phone_number: normalizedPhoneNumber,
    normalized_phone_number: normalizedPhoneNumber,
    day_1: null,
    day_2: null,
    day_3: null,
    day_4: null,
    day_5: null,
  });

  if (
    hasOwnValue(createData, "follow_up_date") &&
    !isBlank(createData.follow_up_date)
  ) {
    const manualReminderScheduled = await scheduleManualFollowUpIfEligible(
      lead,
      createData.follow_up_date,
      createData,
    );

    if (manualReminderScheduled) {
      await persistPendingFollowUpCompliance({
        lead,
        followUpDate: createData.follow_up_date,
        source: "SYSTEM",
        reason: "Pending follow-up call check",
      });

      await createFollowUpHistoryEntry({
        client_id: lead.client_id,
        lead_id: lead.id,
        call_id: lead.call_id,
        phone_number: lead.phone_number,
        customer_name: lead.customer_name,
        old_follow_up_date: null,
        new_follow_up_date: lead.follow_up_date ?? createData.follow_up_date,
        change_type: "CREATED",
        reason: "Follow-up date created",
        changed_by_user_id: actor?.changed_by_user_id ?? null,
        changed_by_name: actor?.changed_by_name ?? null,
        source: actor?.source || "FRONTEND",
      });
    }

    if (!isTerminalLeadStatus(lead.status)) {
      return lead;
    }
  }
  // Keep lead and reminder state consistent: surface scheduling failures.
  await processLeadStatus(lead, clientId, "create");
  return lead;
};

export const findPixelEyeLeadByPhone = async (clientId, phoneNumber) => {
  const normalizedIncoming = normalizeLeadPhone(phoneNumber);
  if (!normalizedIncoming) return null;

  const latestLead = await db.PixelEye.findOne({
    where: {
      client_id: clientId,
      normalized_phone_number: normalizedIncoming,
    },
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  if (!latestLead) {
    return null;
  }

  return (await isPixelEyeLeadActive(latestLead)) ? latestLead : null;
};

export const updatePixelEyeLead = async (
  id,
  data,
  tenantContext,
  actor = {},
) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });

  if (!lead) throw new Error("Lead not found or unauthorized");

  const role = String(tenantContext?.role || "")
    .trim()
    .toLowerCase();
  const isClientRole = role === "client";

  if (isClientRole) {
    const hasDirectDayFieldUpdate = DAY_FIELDS.some((field) =>
      hasOwnValue(data, field),
    );
    const hasMappedDayUpdate =
      hasOwnValue(data, "day") || hasOwnValue(data, "value");

    if (hasDirectDayFieldUpdate || hasMappedDayUpdate) {
      throw new Error("Use Update Outcome to update day status.");
    }
  }

  if (hasOwnValue(data, "follow_up_date") && !isBlank(lead.follow_up_date)) {
    if (isBlank(data.follow_up_date)) {
      throw new Error("Use the cancel follow-up endpoint.");
    }

    if (isSameFollowUpDate(lead.follow_up_date, data.follow_up_date)) {
      delete data.follow_up_date;
    } else {
      throw new Error("Use the reschedule follow-up endpoint.");
    }
  }

  if (hasOwnValue(data, "follow_up_date")) {
    const reminderState = await getLatestReminderStateForLead(lead);
    if (
      isTerminalLeadStatus(lead.status) ||
      isClosedFollowUpFlowState(reminderState)
    ) {
      throw new Error("Cannot update follow-up date for a closed lead.");
    }
  }

  const previousFollowUpDate = lead.follow_up_date;
  const hasFollowUpDateUpdate = hasOwnValue(data, "follow_up_date");
  const shouldTrackFollowUpHistory = Boolean(actor?.trackFollowUpHistory);
  const followUpDateValue = hasFollowUpDateUpdate
    ? data.follow_up_date
    : undefined;
  const followUpDateWasCleared =
    hasFollowUpDateUpdate && isBlank(followUpDateValue);
  const historyReason = followUpDateWasCleared
    ? String(data.reason || "Follow-up date cleared").trim() ||
      "Follow-up date cleared"
    : String(data.reason || "Follow-up date updated").trim() ||
      "Follow-up date updated";
  const historyPayload =
    hasFollowUpDateUpdate && shouldTrackFollowUpHistory
      ? {
          client_id: lead.client_id,
          lead_id: lead.id,
          call_id: lead.call_id,
          phone_number: lead.phone_number,
          customer_name: lead.customer_name,
          old_follow_up_date: previousFollowUpDate,
          new_follow_up_date: followUpDateWasCleared ? null : followUpDateValue,
          change_type: followUpDateWasCleared ? "CLEARED" : "UPDATED",
          source: "FRONTEND",
          reason: historyReason,
          changed_by_user_id: actor?.changed_by_user_id ?? null,
          changed_by_name: actor?.changed_by_name ?? null,
        }
      : null;

  if (hasOwnValue(data, "follow_up_date") && !isBlank(data.follow_up_date)) {
    getManualFollowUpScheduledAt(data.follow_up_date);
  }

  if (hasOwnValue(data, "phone_number")) {
    const normalizedPhoneNumber = normalizeLeadPhone(data.phone_number);
    if (!normalizedPhoneNumber) {
      throw new Error("Invalid phone number");
    }

    data.phone_number = normalizedPhoneNumber;
    data.normalized_phone_number = normalizedPhoneNumber;
  }

  let updateData = { ...data };
  if (hasOwnValue(updateData, "status")) {
    updateData.status = normalizePixelEyeMainStatus(updateData.status);
  }
  for (const dayField of DAY_FIELDS) {
    if (hasOwnValue(updateData, dayField)) {
      updateData[dayField] = normalizePixelEyeOutcomeStatus(
        updateData[dayField],
      );
    }
  }
  if (hasOwnValue(updateData, "notes")) {
    updateData.notes = normalizeLeadNotes(updateData.notes);
  }
  if (hasOwnValue(updateData, "reason")) {
    delete updateData.reason;
  }
  const hasDay = Object.prototype.hasOwnProperty.call(data, "day");
  const hasValue = Object.prototype.hasOwnProperty.call(data, "value");

  if (hasDay !== hasValue) {
    throw new Error("Both day and value are required for day updates");
  }

  if (hasDay && hasValue) {
    const dayField = ["day_1", "day_2", "day_3", "day_4", "day_5"].includes(
      data.day,
    )
      ? data.day
      : null;

    if (!dayField) {
      throw new Error("Invalid day field");
    }

    updateData = {
      ...updateData,
      [dayField]: normalizePixelEyeOutcomeStatus(data.value),
    };
    delete updateData.day;
    delete updateData.value;
  }

  // Prevent tenant hijacking during update
  if (!tenantContext.isSuperAdmin) {
    delete updateData.client_id;
  }

  if (Object.keys(updateData).length === 0) {
    return lead;
  }

  assertDayUpdateAllowed(lead, updateData);

  const statusBefore = lead.status;
  const updatedLead = await lead.update(updateData);

  const logFollowUpHistory = async () => {
    if (!historyPayload) {
      return null;
    }

    return await createFollowUpHistoryEntry({
      ...historyPayload,
      new_follow_up_date:
        updatedLead.follow_up_date ?? historyPayload.new_follow_up_date,
    });
  };

  if (
    historyPayload &&
    (followUpDateWasCleared || isTerminalLeadStatus(updatedLead.status))
  ) {
    await logFollowUpHistory();
  }

  if (isTerminalLeadStatus(updatedLead.status)) {
    await processLeadStatus(
      updatedLead,
      updatedLead.client_id,
      "update-terminal",
    );
    return updatedLead;
  }

  const followUpDateProvided =
    hasOwnValue(updateData, "follow_up_date") &&
    !isBlank(updateData.follow_up_date);
  if (followUpDateProvided) {
    const manualReminderScheduled = await scheduleManualFollowUpIfEligible(
      updatedLead,
      updateData.follow_up_date,
      updateData,
    );

    if (manualReminderScheduled) {
      await persistPendingFollowUpCompliance({
        lead: updatedLead,
        followUpDate: updateData.follow_up_date,
        source: actor?.source || "SYSTEM",
        reason: "Pending follow-up call check",
      });
    }

    await logFollowUpHistory();

    if (!isTerminalLeadStatus(updatedLead.status)) {
      return updatedLead;
    }
  }

  // Trigger notification logic only when the status field changed.
  if (
    Object.prototype.hasOwnProperty.call(updateData, "status") &&
    updateData.status !== statusBefore
  ) {
    await processLeadStatus(updatedLead, updatedLead.client_id, "update");
  }

  // Trigger notification logic when a day field is manually updated.
  for (const dayField of DAY_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(updateData, dayField) &&
      updateData[dayField]
    ) {
      const dayNumber = parseInt(dayField.split("_")[1], 10);
      await processDayStatus(
        updatedLead,
        updatedLead.client_id,
        dayNumber,
        updateData[dayField],
      );
      break; // Only one day field should change per API request
    }
  }

  return updatedLead;
};

export const applyPixelEyeFollowUpOutcome = async (
  id,
  status,
  tenantContext,
  transaction = null,
) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const normalizedOutcomeStatus = normalizePixelEyeOutcomeStatus(status);

  const runOutcomeUpdate = async (transactionContext) => {
    const lead = await safeModel.findOne({
      where: { id },
      transaction: transactionContext,
      lock: transactionContext.LOCK.UPDATE,
    });

    if (!lead) {
      throw new Error("Lead not found or unauthorized");
    }

    const reminderState = await getLatestReminderStateForLead(lead, {
      transaction,
    });

    if (
      isTerminalPixelEyeLeadValue(lead.status) ||
      isTerminalPixelEyeLeadValue(getLatestFollowUpDayValue(lead)) ||
      isClosedFollowUpFlowState(reminderState) ||
      hasAllFollowUpDaysFilled(lead)
    ) {
      throw new Error("Outcome flow is already completed.");
    }

    const nextDayIndex = DAY_FIELDS.findIndex((field) => isBlank(lead[field]));
    if (nextDayIndex === -1) {
      throw new Error("Outcome flow is already completed.");
    }

    const updatedDay = DAY_FIELDS[nextDayIndex];
    const nextDayNumber = nextDayIndex + 1;
    const allowedStatuses = getAllowedStatusesForDay(nextDayNumber);

    if (!allowedStatuses.includes(normalizedOutcomeStatus)) {
      throw new Error(
        `Selected status is not allowed for Day ${nextDayNumber}.`,
      );
    }

    assertDayUpdateAllowed(
      lead,
      { [updatedDay]: normalizedOutcomeStatus },
      {
        allowTerminalLeadStatus: true,
      },
    );

    const updatedLead = await lead.update(
      { [updatedDay]: normalizedOutcomeStatus },
      { transaction: transactionContext },
    );

    return {
      lead: updatedLead,
      updatedDay,
      dayNumber: nextDayNumber,
    };
  };

  if (transaction) {
    return await runOutcomeUpdate(transaction);
  }

  return await db.sequelize.transaction(runOutcomeUpdate);
};

export const updatePixelEyeFollowUpOutcome = async (
  id,
  status,
  tenantContext,
) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const leadBefore = await safeModel.findOne({ where: { id } });
  if (!leadBefore) {
    throw new Error("Lead not found or unauthorized");
  }

  const clientId = leadBefore.client_id;
  const callId = leadBefore.call_id;
  const oldFollowUpDate = leadBefore?.follow_up_date ?? null;
  const nextDayIndex = DAY_FIELDS.findIndex((field) =>
    isBlank(leadBefore[field]),
  );
  const dayField = nextDayIndex >= 0 ? DAY_FIELDS[nextDayIndex] : null;
  const oldDayValue = dayField ? (leadBefore?.[dayField] ?? null) : null;

  // Capture previous reminder snapshot
  const prevReminder = await db.PixelEyeLeadState.findOne({
    where: {
      client_id: clientId,
      ...(leadBefore.id ? { lead_id: leadBefore.id } : {}),
      ...(callId ? { call_id: callId } : {}),
    },
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  const prevReminderSnapshot = prevReminder
    ? {
        id: prevReminder.id,
        state: prevReminder.state,
        schedule_type: prevReminder.schedule_type,
        scheduled_at: prevReminder.scheduled_at,
        notification_sent: prevReminder.notification_sent,
        completion_source: prevReminder.completion_source,
        current_day: prevReminder.current_day,
        permanently_closed: prevReminder.permanently_closed,
      }
    : null;

  // Capture previous compliance rows
  const prevComplianceRows = await db.PixelEyeFollowUpCallCompliance.findAll({
    where: {
      client_id: clientId,
      ...(leadBefore.id ? { lead_id: leadBefore.id } : {}),
      ...(callId ? { call_id: callId } : {}),
    },
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  const prevCompliance = (prevComplianceRows || []).map((r) => ({
    id: r.id,
    compliance_status: r.compliance_status,
    scheduled_follow_up_at: r.scheduled_follow_up_at,
    allowed_until: r.allowed_until,
  }));

  const normalizedStatus = normalizePixelEyeOutcomeStatus(status);
  const outcome = await applyPixelEyeFollowUpOutcome(
    id,
    normalizedStatus,
    tenantContext,
  );
  const resolvedDayField =
    dayField || outcome.updatedDay || `day_${outcome.dayNumber}`;

  // Apply outcome and process scheduling (override manual reminder)
  await processDayStatus(
    outcome.lead,
    outcome.lead.client_id,
    outcome.dayNumber,
    normalizedStatus,
    { source: "FOLLOW_UP_OUTCOME", overrideManualReminder: true },
  );

  // Resolve pending compliance for this lead so it will not become MISSED later.
  try {
    await cancelPendingFollowUpComplianceForLead({
      client_id: outcome.lead.client_id,
      lead_id: outcome.lead.id,
      reason: "Resolved by manual follow-up outcome update",
      source: "FOLLOW_UP_OUTCOME",
    });
  } catch (err) {
    console.error(
      "Failed to cancel pending follow-up compliance:",
      err?.message || err,
    );
  }

  // Refresh lead and capture new values
  let updatedLead = await db.PixelEye.findOne({
    where: { id: outcome.lead.id },
  });

  await markNormalLeadAttentionResolved(updatedLead, normalizedStatus);

  if (!isBlank(oldFollowUpDate) && !isBlank(updatedLead?.follow_up_date)) {
    updatedLead = await updatedLead.update({ follow_up_date: null });
  }

  const newFollowUpDate = updatedLead?.follow_up_date ?? null;
  const newDayValue = updatedLead?.[resolvedDayField] ?? null;

  // New reminder snapshot
  const newReminder = await db.PixelEyeLeadState.findOne({
    where: {
      client_id: clientId,
      ...(updatedLead?.id ? { lead_id: updatedLead.id } : {}),
      ...(callId ? { call_id: callId } : {}),
    },
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  const newReminderSnapshot = newReminder
    ? {
        id: newReminder.id,
        state: newReminder.state,
        schedule_type: newReminder.schedule_type,
        scheduled_at: newReminder.scheduled_at,
        notification_sent: newReminder.notification_sent,
        completion_source: newReminder.completion_source,
        current_day: newReminder.current_day,
        permanently_closed: newReminder.permanently_closed,
      }
    : null;

  const newComplianceRows = await db.PixelEyeFollowUpCallCompliance.findAll({
    where: {
      client_id: clientId,
      ...(updatedLead?.id ? { lead_id: updatedLead.id } : {}),
      ...(callId ? { call_id: callId } : {}),
    },
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  const newCompliance = (newComplianceRows || []).map((r) => ({
    id: r.id,
    compliance_status: r.compliance_status,
    scheduled_follow_up_at: r.scheduled_follow_up_at,
    allowed_until: r.allowed_until,
    reason: r.reason || null,
  }));

  // Build metadata
  const metadata = {
    action: "OUTCOME_APPLIED",
    day_field: resolvedDayField,
    outcome_status: normalizedStatus,
    old_day_value: oldDayValue ?? null,
    new_day_value: newDayValue ?? null,
    old_follow_up_date: oldFollowUpDate ?? null,
    new_follow_up_date: newFollowUpDate ?? null,
    follow_up_date_cleared_reason:
      "Resolved by manual follow-up outcome update",
    prev_reminder: prevReminderSnapshot,
    new_reminder: newReminderSnapshot,
    prev_compliance: prevCompliance,
    new_compliance: newCompliance,
  };

  // If follow_up_date existed before, clear it and write CLEARED with metadata
  if (!isBlank(oldFollowUpDate)) {
    await createFollowUpHistoryEntry({
      client_id: updatedLead.client_id,
      lead_id: updatedLead.id,
      call_id: updatedLead.call_id,
      phone_number: updatedLead.phone_number,
      customer_name: updatedLead.customer_name,
      old_follow_up_date: oldFollowUpDate,
      new_follow_up_date: null,
      change_type: "CLEARED",
      source: "SYSTEM",
      reason: "Follow-up outcome updated",
      metadata,
    });
  } else {
    // No follow_up_date to clear ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â write a metadata-bearing UPDATED entry once
    await createFollowUpHistoryEntry({
      client_id: updatedLead.client_id,
      lead_id: updatedLead.id,
      call_id: updatedLead.call_id,
      phone_number: updatedLead.phone_number,
      customer_name: updatedLead.customer_name,
      old_follow_up_date: oldFollowUpDate,
      new_follow_up_date: newFollowUpDate,
      change_type: "UPDATED",
      source: "SYSTEM",
      reason: "Follow-up outcome applied",
      metadata,
    });
  }

  return {
    lead: updatedLead,
    updated_day: outcome.updatedDay,
    status: normalizedStatus,
  };
};

const buildManualCreateDuplicateMetadataUpdate = (data = {}) => {
  const allowedMetadataFields = [
    "customer_name",
    "agent_name",
    "source",
    "type_of_enquiry",
    "notes",
  ];
  const updateData = {};

  for (const field of allowedMetadataFields) {
    if (!hasOwnValue(data, field)) {
      continue;
    }

    updateData[field] =
      field === "notes" ? normalizeLeadNotes(data[field]) : data[field];
  }

  return updateData;
};

const buildManualFollowUpSignalMetadataUpdate = (data = {}) => {
  const allowedMetadataFields = [
    "customer_name",
    "source",
    "type_of_enquiry",
    "notes",
  ];
  const updateData = {};

  for (const field of allowedMetadataFields) {
    if (!hasOwnValue(data, field)) {
      continue;
    }

    updateData[field] =
      field === "notes" ? normalizeLeadNotes(data[field]) : data[field];
  }

  return updateData;
};

const isManualFollowUpSignalLead = async (lead) => {
  if (!lead?.id || isBlank(lead.follow_up_date)) {
    return false;
  }

  return await isPixelEyeLeadActive(lead);
};

const markManualFollowUpSignalCompliance = async (lead, data = {}) => {
  const statusText = String(data.status || "").trim();
  const reason = statusText
    ? `Manual same-phone follow-up signal received: ${statusText}`
    : "Manual same-phone follow-up signal received";

  let compliance = await markPendingFollowUpComplianceCalledForLead({
    client_id: lead.client_id,
    lead_id: lead.id,
    follow_up_date: lead.follow_up_date,
    reason,
    source: "FRONTEND",
  });

  if (!compliance && !isBlank(lead.follow_up_date)) {
    const pendingCompliance = await createOrUpdatePendingFollowUpCompliance({
      client_id: lead.client_id,
      lead_id: lead.id,
      call_id: lead.call_id,
      phone_number: lead.phone_number,
      customer_name: lead.customer_name,
      agent_name: lead.agent_name,
      follow_up_date: lead.follow_up_date,
      source: "FRONTEND",
      reason: "Pending follow-up call check from manual same-phone signal",
    });

    if (pendingCompliance) {
      compliance = await markPendingFollowUpComplianceCalledForLead({
        client_id: lead.client_id,
        lead_id: lead.id,
        follow_up_date: lead.follow_up_date,
        reason,
        source: "FRONTEND",
      });
    }
  }

  return compliance;
};

export const continuePixelEyeLeadFromManualCreate = async (
  lead,
  data = {},
  tenantContext,
) => {
  if (!lead?.id) {
    throw new Error("Lead not found or unauthorized");
  }

  const metadataUpdate = (await isManualFollowUpSignalLead(lead))
    ? buildManualFollowUpSignalMetadataUpdate(data)
    : buildManualCreateDuplicateMetadataUpdate(data);

  const updatedLead =
    Object.keys(metadataUpdate).length > 0
      ? await lead.update(metadataUpdate)
      : lead;

  await createManualSameNumberAttentionCallLog(updatedLead, data);

  const enrichedLead = await getPixelEyeLead(updatedLead.id, tenantContext);

  return {
    lead: enrichedLead || updatedLead,
    action: "same_number_outcome_pending",
    result: "same_number_outcome_pending",
    updated_day: null,
    status: null,
    normal_lead_attention_state: NORMAL_LEAD_ATTENTION_STATE,
    normal_lead_attention_label: NORMAL_LEAD_ATTENTION_LABEL,
    needs_manual_day_outcome: true,
  };
};

export const deletePixelEyeLead = async (id, tenantContext) => {
  const safePixelEye = tenantSafe(db.PixelEye, tenantContext);
  // Use a transaction to keep related reminder state and compliance rows in sync.
  return await db.sequelize.transaction(async (tx) => {
    const lead = await safePixelEye.findOne({ where: { id }, transaction: tx });
    if (!lead) throw new Error("Lead not found or unauthorized");

    const clientId = lead.client_id;
    const callId = lead.call_id;

    // Remove any follow-up compliance rows linked to this lead (by lead_id) or call_id for this client
    const safeCompliance = tenantSafe(
      db.PixelEyeFollowUpCallCompliance,
      tenantContext,
    );
    await safeCompliance.destroy({ where: { lead_id: id }, transaction: tx });

    // Also remove any legacy/matched compliance rows referencing the call_id for this client
    if (callId) {
      await safeCompliance.destroy({
        where: { client_id: clientId, call_id: callId },
        transaction: tx,
      });
    }

    // Remove any reminder state for this client+call
    const safeState = tenantSafe(db.PixelEyeLeadState, tenantContext);
    if (callId) {
      await safeState.destroy({
        where: { client_id: clientId, call_id: callId },
        transaction: tx,
      });
    }

    // Remove follow-up history entries for this lead or call (destructive purge)
    const safeHistory = tenantSafe(db.PixelEyeFollowUpHistory, tenantContext);
    await safeHistory.destroy({ where: { lead_id: id }, transaction: tx });
    if (callId) {
      await safeHistory.destroy({
        where: { client_id: clientId, call_id: callId },
        transaction: tx,
      });
    }

    // Remove raw payloads for this lead (permissive purge)
    const safeCallLog = tenantSafe(db.PixelEyeCallLog, tenantContext);
    if (callId) {
      await safeCallLog.destroy({
        where: { client_id: clientId, call_id: callId },
        transaction: tx,
      });
    }

    // Finally remove the lead row
    const deleted = await safePixelEye.destroy({
      where: { id },
      transaction: tx,
    });
    if (!deleted) throw new Error("Lead not found");

    return true;
  });
};
