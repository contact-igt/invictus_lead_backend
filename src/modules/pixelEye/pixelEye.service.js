import db from "../../database/index.js";
import { tenantSafe } from "../../utils/tenantContext.js";
import { Op, col, fn, where } from "sequelize";
import {
  processLeadStatus,
  processDayStatus,
  scheduleManualFollowUpReminder,
  markFollowUpReminderHandled,
  isTerminalLeadStatus,
  resolveManualFollowUpScheduledAt,
} from "./pixelEyeNotification.service.js";
import {
  createFollowUpHistoryEntry,
  getFollowUpChangeSummaryForLead,
  getFollowUpChangeSummaryMapForLeads,
} from "./pixelEyeFollowUpHistory.service.js";
import {
  createOrUpdatePendingFollowUpCompliance,
} from "./pixelEyeFollowUpCallCompliance.service.js";

const buildLeadFilters = ({ dateFrom, dateTo, agent } = {}) => {
  const filters = {};

  const normalizedDateFrom = String(dateFrom || "").trim();
  const normalizedDateTo = String(dateTo || "").trim();
  const normalizedAgent = String(agent || "").trim();

  if (normalizedDateFrom && normalizedDateTo) {
    filters.date = { [Op.between]: [normalizedDateFrom, normalizedDateTo] };
  } else if (normalizedDateFrom) {
    filters.date = { [Op.gte]: normalizedDateFrom };
  } else if (normalizedDateTo) {
    filters.date = { [Op.lte]: normalizedDateTo };
  }

  if (normalizedAgent) {
    filters.agent_name = normalizedAgent;
  }

  return filters;
};

const normalizePhone = (phone) =>
  String(phone || "")
    .trim()
    .replace(/\D/g, "");

const buildClientCallKey = (clientId, callId) =>
  `${clientId}:${String(callId || "").trim()}`;

const attachReminderState = (lead, reminderState, historySummary = {}) => ({
  ...lead.toJSON(),
  followup_state: reminderState?.state ?? null,
  reminder_schedule_type: reminderState?.schedule_type ?? null,
  reminder_scheduled_at: reminderState?.scheduled_at ?? null,
  reminder_notification_sent: reminderState?.notification_sent ?? null,
  reminder_notification_sent_at: reminderState?.notification_sent_at ?? null,
  reminder_reason: reminderState?.reason ?? null,
  reminder_permanently_closed: reminderState?.permanently_closed ?? null,
  reminder_cancel_reason: reminderState?.cancel_reason ?? null,
  follow_up_change_count: Number(historySummary?.count || 0),
  latest_follow_up_change_at: historySummary?.latest_follow_up_change_at ?? null,
});

const hasOwnValue = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === "";

const DAY_FIELDS = ["day_1", "day_2", "day_3", "day_4", "day_5"];

const getDayFieldIndex = (field) => DAY_FIELDS.indexOf(field);

const getValueFromUpdateOrLead = (updateData, lead, field) => {
  if (hasOwnValue(updateData, field)) {
    return updateData[field];
  }

  return lead?.[field];
};

const assertDayUpdateAllowed = (lead, updateData) => {
  const changedDayField = DAY_FIELDS.find((field) => hasOwnValue(updateData, field));
  if (!changedDayField) {
    return;
  }

  const nextMainStatus = getValueFromUpdateOrLead(updateData, lead, "status");
  if (isTerminalLeadStatus(nextMainStatus)) {
    throw new Error(
      "Cannot update follow-up days because lead status is already closed/terminal.",
    );
  }

  const dayIndex = getDayFieldIndex(changedDayField);
  for (let i = 0; i < dayIndex; i += 1) {
    const priorDayField = DAY_FIELDS[i];
    const priorDayValue = getValueFromUpdateOrLead(updateData, lead, priorDayField);

    if (isTerminalLeadStatus(priorDayValue)) {
      throw new Error(
        "Cannot update next follow-up day because previous day is already closed/terminal.",
      );
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

const scheduleManualFollowUpIfEligible = async (lead, followUpDate, options = {}) => {
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
    reason: String(options.reason || "Manual Follow-up Reminder").trim() || "Manual Follow-up Reminder",
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
      `[PixelEye] Failed to create/update pending compliance for call_id=${lead?.call_id || "â€”"}`,
    );
  }

  return compliance;
};

export const reschedulePixelEyeFollowUp = async (id, tenantContext, data = {}, actor = {}) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });

  if (!lead) throw new Error("Lead not found or unauthorized");

  if (isTerminalLeadStatus(lead.status)) {
    throw new Error("Lead is terminal and cannot be rescheduled");
  }

  const existingState = await db.PixelEyeLeadState.findOne({
    where: {
      client_id: lead.client_id,
      call_id: lead.call_id,
    },
  });

  if (existingState?.permanently_closed) {
    throw new Error("Lead is permanently closed and cannot be rescheduled");
  }

  const oldFollowUpDate = lead.follow_up_date;
  const followUpDate = String(data.follow_up_date || "").trim();
  if (!followUpDate) {
    throw new Error("follow_up_date is required");
  }

  const scheduledAt = getManualFollowUpScheduledAt(followUpDate);
  const reason = String(data.reason || "Follow-up rescheduled").trim() || "Follow-up rescheduled";

  const updatedLead = await lead.update({
    follow_up_date: scheduledAt.toISOString(),
  });

  const reminderState = await scheduleManualFollowUpReminder(updatedLead, scheduledAt, {
    clientId: updatedLead.client_id,
    callId: updatedLead.call_id,
    reason,
  });

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
  "not interested",
  "closed",
  "converted",
  "wrong number",
  "invalid number",
  "patient not required",
]);

const isClosedFollowUpOutcome = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized) && (isTerminalLeadStatus(normalized) || CLOSE_OUTCOME_SET.has(normalized));
};

export const cancelPixelEyeFollowUp = async (id, tenantContext, data = {}) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });

  if (!lead) {
    throw new Error("Lead not found or unauthorized");
  }

  const nextStatus = String(data.status || "").trim();
  const cancelReason = String(data.reason || nextStatus || "Follow-up cancelled").trim() || "Follow-up cancelled";
  const shouldPermanentlyClose =
    isClosedFollowUpOutcome(nextStatus) || isClosedFollowUpOutcome(cancelReason);

  const updateData = {};
  if (nextStatus) {
    updateData.status = nextStatus;
  }

  const updatedLead = Object.keys(updateData).length > 0
    ? await lead.update(updateData)
    : lead;

  const existingState = await db.PixelEyeLeadState.findOne({
    where: {
      client_id: updatedLead.client_id,
      call_id: updatedLead.call_id,
    },
  });

  let reminderState = null;
  if (existingState) {
    reminderState = await existingState.update({
      state: "cancelled",
      permanently_closed: shouldPermanentlyClose,
      cancel_reason: cancelReason,
      last_status: updatedLead.status ?? existingState.last_status ?? null,
      customer_name: updatedLead.customer_name ?? existingState.customer_name ?? null,
      phone_number: updatedLead.phone_number ?? existingState.phone_number ?? null,
      agent_name: updatedLead.agent_name ?? existingState.agent_name ?? null,
    });
  } else {
    reminderState = await db.PixelEyeLeadState.create({
      client_id: updatedLead.client_id,
      call_id: updatedLead.call_id,
      customer_name: updatedLead.customer_name ?? null,
      phone_number: updatedLead.phone_number ?? null,
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
    });
  }

  console.log(
    `[PixelEye] Cancelled follow-up for call_id=${updatedLead.call_id}` +
      (existingState ? ` permanently_closed=${shouldPermanentlyClose}` : " (no active reminder row found)"),
  );

  return {
    lead: updatedLead,
    reminderState,
    hadReminder: Boolean(existingState),
  };
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
  const scopedClientId = clientId || (tenantContext?.isSuperAdmin ? null : tenantContext?.id);
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
    const key = buildClientCallKey(state.client_id, state.call_id);
    if (!reminderStateMap.has(key)) {
      reminderStateMap.set(key, state);
    }
  }

  const historySummaryMap = await getFollowUpChangeSummaryMapForLeads(leads);

  return leads.map((lead) =>
    attachReminderState(
      lead,
      reminderStateMap.get(buildClientCallKey(lead.client_id, lead.call_id)),
      getFollowUpChangeSummaryForLead(historySummaryMap, lead),
    ),
  );
};

export const listPixelEyeLeadsForExport = async (
  tenantContext,
  queryFilters = {},
  clientId,
) => {
  const scopedClientId = clientId || (tenantContext?.isSuperAdmin ? null : tenantContext?.id);
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
  return await safeModel.findOne({ where: { id } });
};

export const createPixelEyeLead = async (data, clientId, actor = {}) => {
  if (hasOwnValue(data, "follow_up_date") && !isBlank(data.follow_up_date)) {
    getManualFollowUpScheduledAt(data.follow_up_date);
  }

  const lead = await db.PixelEye.create({ ...data, client_id: clientId });

  if (hasOwnValue(data, "follow_up_date") && !isBlank(data.follow_up_date)) {
    const manualReminderScheduled = await scheduleManualFollowUpIfEligible(
      lead,
      data.follow_up_date,
      data,
    );

    if (manualReminderScheduled) {
      await persistPendingFollowUpCompliance({
        lead,
        followUpDate: data.follow_up_date,
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
        new_follow_up_date: lead.follow_up_date ?? data.follow_up_date,
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

  // Fire-and-forget: schedule callback based on initial status.
  processLeadStatus(lead, clientId, "create").catch((err) =>
    console.error(
      `[PixelEye] processLeadStatus(create) failed for call_id=${lead?.call_id}:`,
      err?.message,
    ),
  );
  return lead;
};

export const findPixelEyeLeadByPhone = async (clientId, phoneNumber) => {
  const rawPhone = String(phoneNumber || "").trim();
  if (!rawPhone) return null;

  const exactMatch = await db.PixelEye.findOne({
    where: { client_id: clientId, phone_number: rawPhone },
    order: [["createdAt", "DESC"]],
  });

  if (exactMatch) {
    return exactMatch;
  }

  const normalizedIncoming = normalizePhone(rawPhone);
  if (!normalizedIncoming) return null;
  const incomingLast10 =
    normalizedIncoming.length > 10
      ? normalizedIncoming.slice(-10)
      : normalizedIncoming;

  const normalizedDbPhone = fn(
    "REPLACE",
    fn(
      "REPLACE",
      fn(
        "REPLACE",
        fn("REPLACE", fn("REPLACE", col("phone_number"), " ", ""), "-", ""),
        "+",
        "",
      ),
      "(",
      "",
    ),
    ")",
    "",
  );

  const lead = await db.PixelEye.findOne({
    where: {
      client_id: clientId,
      [Op.or]: [
        where(normalizedDbPhone, normalizedIncoming),
        where(fn("RIGHT", normalizedDbPhone, 10), incomingLast10),
      ],
    },
    order: [["createdAt", "DESC"]],
  });

  return lead;
};

export const updatePixelEyeLead = async (id, data, tenantContext, actor = {}) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });

  if (!lead) throw new Error("Lead not found or unauthorized");

  const previousFollowUpDate = lead.follow_up_date;
  const hasFollowUpDateUpdate = hasOwnValue(data, "follow_up_date");
  const shouldTrackFollowUpHistory = Boolean(actor?.trackFollowUpHistory);
  const followUpDateValue = hasFollowUpDateUpdate ? data.follow_up_date : undefined;
  const followUpDateWasCleared = hasFollowUpDateUpdate && isBlank(followUpDateValue);
  const historyReason = followUpDateWasCleared
    ? String(data.reason || "Follow-up date cleared").trim() || "Follow-up date cleared"
    : String(data.reason || "Follow-up date updated").trim() || "Follow-up date updated";
  const historyPayload = hasFollowUpDateUpdate && shouldTrackFollowUpHistory
    ? {
        client_id: lead.client_id,
        lead_id: lead.id,
        call_id: lead.call_id,
        phone_number: lead.phone_number,
        customer_name: lead.customer_name,
        old_follow_up_date: previousFollowUpDate,
        new_follow_up_date: followUpDateWasCleared
          ? null
          : followUpDateValue,
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

  let updateData = { ...data };
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

    updateData = { ...updateData, [dayField]: data.value };
    delete updateData.day;
    delete updateData.value;
  }

  // Prevent tenant hijacking during update
  if (!tenantContext.isSuperAdmin) {
    delete updateData.client_id;
  }

  assertDayUpdateAllowed(lead, updateData);

  const statusBefore = lead.status;
  const updatedLead  = await lead.update(updateData);

  const logFollowUpHistory = async () => {
    if (!historyPayload) {
      return null;
    }

    return await createFollowUpHistoryEntry({
      ...historyPayload,
      new_follow_up_date: updatedLead.follow_up_date ?? historyPayload.new_follow_up_date,
    });
  };

  if (historyPayload && (followUpDateWasCleared || isTerminalLeadStatus(updatedLead.status))) {
    await logFollowUpHistory();
  }

  if (isTerminalLeadStatus(updatedLead.status)) {
    processLeadStatus(updatedLead, updatedLead.client_id, "update-terminal").catch((err) =>
      console.error(`[PixelEye] processLeadStatus(update-terminal) failed for call_id=${updatedLead?.call_id}:`, err?.message),
    );
    return updatedLead;
  }

  const followUpDateProvided =
    hasOwnValue(updateData, "follow_up_date") && !isBlank(updateData.follow_up_date);
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
    processLeadStatus(updatedLead, updatedLead.client_id, "update").catch((err) =>
      console.error(`[PixelEye] processLeadStatus(update) failed for call_id=${updatedLead?.call_id}:`, err?.message),
    );
  }

  // Trigger notification logic when a day field is manually updated.
  for (const dayField of DAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updateData, dayField) && updateData[dayField]) {
      const dayNumber = parseInt(dayField.split("_")[1], 10);
      processDayStatus(updatedLead, updatedLead.client_id, dayNumber, updateData[dayField])
        .catch((err) =>
          console.error(
            `[PixelEye] processDayStatus(${dayField}) failed for call_id=${updatedLead?.call_id}:`,
            err?.message,
          ),
        );
      break; // Only one day field should change per API request
    }
  }

  return updatedLead;
};

export const deletePixelEyeLead = async (id, tenantContext) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const deleted = await safeModel.destroy({ where: { id } });

  if (!deleted) throw new Error("Lead not found or unauthorized");
  return true;
};

export const markPixelEyeFollowUpHandled = async (id, tenantContext, reason) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });

  if (!lead) {
    throw new Error("Lead not found or unauthorized");
  }

  const handledState = await markFollowUpReminderHandled(lead, {
    clientId: lead.client_id,
    callId: lead.call_id,
    reason,
  });

  return {
    lead,
    reminderState: handledState,
  };
};
