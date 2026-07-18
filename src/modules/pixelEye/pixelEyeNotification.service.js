import { Op } from "sequelize";
import db from "../../database/index.js";
import { normalizePixelEyePhoneNumber } from "./pixelEyePhoneNumber.js";
import {
  ALLOWED_SCHEDULE_TYPES,
  getStatusCategory,
  isTerminalPixelEyeStatus,
} from "./pixelEyeStatusPolicy.js";
import { formatAppDateTime, parseAppDateTime } from "../../utils/dateTime.js";

const TIMEZONE_LABEL = "IST";
const GOOGLE_CHAT_WEBHOOK_TIMEOUT_MS = 15_000;

// How long past the scheduled_at time we will keep retrying before giving up.
// Prevents an infinite retry loop if the webhook is permanently unavailable.
const NOTIFICATION_RETRY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

const DUE_NOTIFICATION_BATCH_LIMIT = 50;

// ---------------------------------------------------------------------------
// STATE HELPERS  (mirrors getState_ / saveState_ / createEmptyState_)
// ---------------------------------------------------------------------------

const getLeadState = async (
  callId,
  clientId,
  phoneNumber = null,
  leadId = null,
) => {
  const normalizedPhoneNumber = normalizePixelEyePhoneNumber(phoneNumber);
  const normalizedLeadId = Number(leadId || 0) || null;

  if (clientId && normalizedLeadId) {
    const leadState = await db.PixelEyeLeadState.findOne({
      where: {
        client_id: clientId,
        lead_id: normalizedLeadId,
      },
      order: [
        ["updatedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    if (leadState) {
      return leadState;
    }

    if (!callId) {
      return null;
    }

    return null;
  }

  if (clientId && normalizedPhoneNumber) {
    const phoneState = await db.PixelEyeLeadState.findOne({
      where: {
        client_id: clientId,
        normalized_phone_number: normalizedPhoneNumber,
      },
      order: [
        ["updatedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    if (phoneState) {
      return phoneState;
    }
  }

  if (!clientId || !callId) {
    return null;
  }

  return await db.PixelEyeLeadState.findOne({
    where: { call_id: callId, client_id: clientId },
  });
};

export const isTerminalLeadStatus = (status) => {
  return isTerminalPixelEyeStatus(status);
};

export const resolveManualFollowUpScheduledAt = (followUpDate) => {
  const text = String(followUpDate || "").trim();

  if (!text) {
    return null;
  }

  const scheduledAt = parseAppDateTime(text, "09:00:00");
  if (!scheduledAt) {
    throw new Error("Invalid follow_up_date");
  }

  return scheduledAt;
};

const normalizeScheduledAt = (scheduledAt) => {
  const nextScheduledAt =
    scheduledAt instanceof Date
      ? new Date(scheduledAt.getTime())
      : new Date(scheduledAt);

  if (Number.isNaN(nextScheduledAt.getTime())) {
    throw new Error("Invalid scheduledAt value for manual follow-up reminder");
  }

  return nextScheduledAt;
};

const normalizeLeadPhoneNumber = (lead, existingState) =>
  normalizePixelEyePhoneNumber(
    lead?.phone_number ||
      existingState?.phone_number ||
      existingState?.normalized_phone_number,
  );

const buildLeadStateIdentityWhere = ({
  clientId,
  leadId = null,
  normalizedPhoneNumber = null,
  callId = null,
}) => {
  const identityClauses = [];

  if (Number(leadId || 0)) {
    identityClauses.push({ lead_id: Number(leadId) });
  }

  if (normalizedPhoneNumber) {
    identityClauses.push({ normalized_phone_number: normalizedPhoneNumber });
  }

  if (callId) {
    identityClauses.push({ call_id: String(callId).trim() });
  }

  if (!clientId || identityClauses.length === 0) {
    return null;
  }

  return {
    client_id: clientId,
    [Op.or]: identityClauses,
  };
};

const cancelSiblingActiveLeadStates = async ({
  clientId,
  leadId = null,
  normalizedPhoneNumber = null,
  callId = null,
  keepId = null,
  cancelReason = "Superseded by active reminder",
}) => {
  const identityWhere = buildLeadStateIdentityWhere({
    clientId,
    leadId,
    normalizedPhoneNumber,
    callId,
  });

  if (!identityWhere) {
    return 0;
  }

  const whereClause = {
    ...identityWhere,
    state: "scheduled",
    notification_sent: false,
    permanently_closed: { [Op.not]: true },
  };

  if (keepId) {
    whereClause.id = { [Op.ne]: keepId };
  }

  return await db.PixelEyeLeadState.update(
    {
      state: "cancelled",
      schedule_type: null,
      reason: null,
      scheduled_at: null,
      notification_sent: false,
      notification_sent_at: null,
      completion_source: null,
      permanently_closed: false,
      cancel_reason: cancelReason,
      current_day: null,
    },
    {
      where: whereClause,
    },
  );
};

const upsertLeadState = async (callId, clientId, fields) => {
  const normalizedPhoneNumber = normalizeLeadPhoneNumber(fields, fields);
  const leadId = Number(fields?.lead_id || 0) || null;

  const lookupWhere = { client_id: clientId };
  if (leadId) {
    lookupWhere.lead_id = leadId;
  } else if (normalizedPhoneNumber) {
    lookupWhere.normalized_phone_number = normalizedPhoneNumber;
  } else if (callId) {
    lookupWhere.call_id = callId;
  }

  const payload = {
    ...fields,
    ...(callId ? { call_id: callId } : {}),
    ...(leadId ? { lead_id: leadId } : {}),
  };

  if (normalizedPhoneNumber) {
    payload.normalized_phone_number = normalizedPhoneNumber;
  }

  const existingRow = await db.PixelEyeLeadState.findOne({
    where: lookupWhere,
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  let savedRow;
  if (existingRow) {
    savedRow = await existingRow.update(payload);
  } else {
    savedRow = await db.PixelEyeLeadState.create({
      call_id: callId,
      client_id: clientId,
      state: "new",
      day1_mode: "manual",
      current_day: 0,
      notification_sent: false,
      thirty_min_cycle_completed: false,
      permanently_closed: false,
      ...payload,
    });
  }

  await cancelSiblingActiveLeadStates({
    clientId,
    leadId: savedRow?.lead_id ?? leadId,
    normalizedPhoneNumber,
    callId: savedRow?.call_id ?? callId,
    keepId: savedRow?.id,
    cancelReason: `Superseded by active reminder for lead_id=${savedRow?.lead_id ?? leadId ?? "—"}`,
  });

  return savedRow;
};

// ---------------------------------------------------------------------------
// MIRROR DAY 1  (mirrors mirrorDay1IfAllowed_)
// Auto-sets day_1 = status until the first 30-min callback fires.
// Disabled per user request: day 1 status is purely manual.
// ---------------------------------------------------------------------------

const mirrorDay1 = async (lead, state) => {
  // Disabled per user requirements. Day 1 is set manually by agents.
  return;
};

// ---------------------------------------------------------------------------
// SCHEDULE / CANCEL
// ---------------------------------------------------------------------------

const scheduleCallback = async (
  lead,
  clientId,
  delayMinutes,
  type,
  reason,
  options = {},
) => {
  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  const lastStatus = options.lastStatus ?? lead.status;
  const normalizedPhoneNumber = normalizeLeadPhoneNumber(lead, null);

  await upsertLeadState(lead.call_id, clientId, {
    lead_id: lead?.id ?? null,
    customer_name: lead.customer_name,
    phone_number: normalizedPhoneNumber || lead.phone_number,
    normalized_phone_number: normalizedPhoneNumber,
    agent_name: lead.agent_name,
    last_status: lastStatus,
    state: "scheduled",
    schedule_type: type,
    reason: reason,
    scheduled_at: scheduledAt,
    notification_sent: false,
    notification_sent_at: null,
    completion_source: null,
    permanently_closed: false,
    cancel_reason: null,
    ...(options.currentDay === undefined
      ? {}
      : { current_day: options.currentDay }),
  });

  console.log(
    `[PixelEye] Scheduled ${type} callback for call_id=${lead.call_id}` +
      ` at ${scheduledAt.toISOString()} (in ${delayMinutes} min)`,
  );
};

export const scheduleManualFollowUpReminder = async (
  lead,
  scheduledAt,
  options = {},
) => {
  const clientId = Number(options.clientId ?? lead?.client_id);
  const callId = String(options.callId ?? lead?.call_id ?? "").trim();
  const scheduledDate = normalizeScheduledAt(scheduledAt);
  const reason =
    String(options.reason || "Manual Follow-up Reminder").trim() ||
    "Manual Follow-up Reminder";

  if (!clientId) {
    throw new Error("Missing client context for manual follow-up reminder");
  }

  if (!callId) {
    throw new Error("Missing call_id for manual follow-up reminder");
  }

  const existingState = await getLeadState(
    callId,
    clientId,
    lead?.phone_number,
    lead?.id,
  );
  const normalizedPhoneNumber = normalizeLeadPhoneNumber(lead, existingState);
  const payload = {
    lead_id: lead?.id ?? existingState?.lead_id ?? null,
    customer_name: lead?.customer_name ?? existingState?.customer_name ?? null,
    phone_number:
      normalizedPhoneNumber ??
      lead?.phone_number ??
      existingState?.phone_number ??
      null,
    normalized_phone_number: normalizedPhoneNumber,
    agent_name: lead?.agent_name ?? existingState?.agent_name ?? null,
    last_status: lead?.status ?? existingState?.last_status ?? null,
    state: "scheduled",
    schedule_type: "MANUAL",
    reason,
    scheduled_at: scheduledDate,
    notification_sent: false,
    notification_sent_at: null,
    completion_source: null,
    permanently_closed: false,
    cancel_reason: null,
    current_day: null,
  };

  const state = await upsertLeadState(callId, clientId, payload);

  console.log(
    `[PixelEye] Scheduled MANUAL follow-up reminder for call_id=${callId}` +
      ` at ${scheduledDate.toISOString()}`,
  );

  return state;
};

const cancelLeadState = async (
  callId,
  clientId,
  reason,
  lead,
  lastStatus = lead?.status,
) => {
  await upsertLeadState(callId, clientId, {
    lead_id: lead?.id ?? null,
    ...(lead
      ? {
          customer_name: lead.customer_name,
          phone_number:
            normalizeLeadPhoneNumber(lead, null) || lead.phone_number,
          normalized_phone_number: normalizeLeadPhoneNumber(lead, null),
          agent_name: lead.agent_name,
          last_status: lastStatus,
        }
      : {}),
    state: "cancelled",
    schedule_type: null,
    reason: null,
    scheduled_at: null,
    notification_sent: false,
    completion_source: null,
    permanently_closed: true,
    cancel_reason: reason,
  });
};

const resetLeadStateToBaseline = async (lead, clientId, lastStatus) => {
  await upsertLeadState(lead.call_id, clientId, {
    lead_id: lead?.id ?? null,
    customer_name: lead.customer_name,
    phone_number: normalizeLeadPhoneNumber(lead, null) || lead.phone_number,
    normalized_phone_number: normalizeLeadPhoneNumber(lead, null),
    agent_name: lead.agent_name,
    last_status: lastStatus,
    state: "baseline",
    schedule_type: null,
    reason: null,
    scheduled_at: null,
    notification_sent: false,
    notification_sent_at: null,
    completion_source: null,
    permanently_closed: false,
    cancel_reason: null,
  });
};

const syncPermanentlyClosedLeadState = async (
  existingState,
  lead,
  lastStatus,
  extraFields = {},
) => {
  if (!existingState) {
    return null;
  }

  return await existingState.update({
    lead_id: lead?.id ?? existingState.lead_id ?? null,
    customer_name: lead?.customer_name ?? existingState.customer_name ?? null,
    phone_number:
      normalizeLeadPhoneNumber(lead, existingState) ??
      lead?.phone_number ??
      existingState.phone_number ??
      null,
    normalized_phone_number: normalizeLeadPhoneNumber(lead, existingState),
    agent_name: lead?.agent_name ?? existingState.agent_name ?? null,
    last_status: lastStatus,
    ...extraFields,
  });
};

const shouldPreserveActiveManualReminder = (existingState, options = {}) => {
  if (options && options.overrideManualReminder) return false;

  return Boolean(
    existingState &&
    String(existingState.schedule_type || "").trim() === "MANUAL" &&
    String(existingState.state || "").trim() === "scheduled" &&
    !existingState.notification_sent &&
    !existingState.permanently_closed &&
    existingState.scheduled_at,
  );
};

/**
 * Called when an agent manually sets day_1, day_2, day_3, day_4, or day_5.
 * Evaluates the day value's status category and schedules a notification
 * using the existing scheduling functionality.
 *
 * @param {object} lead       - The full lead record after update
 * @param {number} clientId   - The client ID
 * @param {number} dayNumber  - Which day was updated (1-5)
 * @param {string} dayValue   - The new status value set on that day field
 */
export const processDayStatus = async (
  lead,
  clientId,
  dayNumber,
  dayValue,
  options = {},
) => {
  try {
    const callId = lead.call_id;
    const category = getStatusCategory(dayValue);

    const existingState = await getLeadState(
      callId,
      clientId,
      lead?.phone_number,
      lead?.id,
    );
    const normalizedPhoneNumber = normalizeLeadPhoneNumber(lead, existingState);

    // ── No state row yet (unlikely for day updates, but safe) ──
    if (!existingState) {
      if (category === "TERMINATION" || category === "NO_ACTION") {
        await cancelLeadState(
          callId,
          clientId,
          `Day ${dayNumber}: ${dayValue}`,
          lead,
          dayValue,
        );
        return;
      }
      if (category === "UNKNOWN" || category === "NO_REMINDER") {
        await upsertLeadState(callId, clientId, {
          lead_id: lead?.id ?? null,
          customer_name: lead.customer_name,
          phone_number: normalizedPhoneNumber || lead.phone_number,
          normalized_phone_number: normalizedPhoneNumber,
          agent_name: lead.agent_name,
          last_status: dayValue,
          state: "baseline",
          current_day: dayNumber,
        });
        return;
      }
      await _scheduleForDayCategory(
        lead,
        clientId,
        category,
        dayValue,
        dayNumber,
        null,
      );
      return;
    }

    // ── Permanently closed lead — keep it closed during normal day updates ──
    if (existingState.permanently_closed) {
      if (category === "TERMINATION" || category === "NO_ACTION") {
        await cancelLeadState(
          callId,
          clientId,
          `Day ${dayNumber} status: ${dayValue}`,
          lead,
          dayValue,
        );
        return;
      }
      await syncPermanentlyClosedLeadState(existingState, lead, dayValue, {
        current_day: dayNumber,
      });
      console.log(
        `[PixelEye] Preserved permanently closed state for call_id=${callId} during Day ${dayNumber} change to ${dayValue}`,
      );
      return;
    }

    // ── Only process if this day is >= current_day (no going backwards) ──
    if (dayNumber < existingState.current_day) return;

    // ── Terminal / Success status on this day → cancel everything ──
    if (category === "TERMINATION" || category === "NO_ACTION") {
      await cancelLeadState(
        callId,
        clientId,
        `Day ${dayNumber} status: ${dayValue}`,
        lead,
        dayValue,
      );
      return;
    }

    // ── Update state and schedule ──
    await existingState.update({
      lead_id: lead?.id ?? existingState.lead_id ?? null,
      last_status: dayValue,
      current_day: dayNumber,
      customer_name: lead.customer_name,
      phone_number: normalizedPhoneNumber || lead.phone_number,
      normalized_phone_number: normalizedPhoneNumber,
      agent_name: lead.agent_name,
    });

    if (shouldPreserveActiveManualReminder(existingState, options)) {
      console.log(
        `[PixelEye] Preserved active MANUAL reminder for call_id=${callId} during Day ${dayNumber} change to ${dayValue}`,
      );
      return;
    }

    if (category === "UNKNOWN" || category === "NO_REMINDER") {
      await resetLeadStateToBaseline(lead, clientId, dayValue);
      return;
    }

    await _scheduleForDayCategory(
      lead,
      clientId,
      category,
      dayValue,
      dayNumber,
      existingState,
    );
  } catch (err) {
    _logError("processDayStatus", err, lead?.call_id);
    throw err;
  }
};

const _scheduleForDayCategory = async (
  lead,
  clientId,
  category,
  status,
  dayNumber,
  existingState,
) => {
  const dayLabel = `Day ${dayNumber}`;
  const scheduleOptions = { lastStatus: status, currentDay: dayNumber };

  if (category === "THIRTY_MIN") {
    if (
      existingState?.state === "scheduled" &&
      existingState?.schedule_type === "THIRTY_MIN" &&
      existingState?.current_day === dayNumber &&
      !existingState?.notification_sent
    )
      return;
    await scheduleCallback(
      lead,
      clientId,
      30,
      "THIRTY_MIN",
      `${dayLabel}: 30-min callback`,
      scheduleOptions,
    );
    return;
  }
  if (category === "DNP2") {
    await scheduleCallback(
      lead,
      clientId,
      24 * 60,
      "DNP2",
      `${dayLabel}: DNP2 — 24-hr callback`,
      scheduleOptions,
    );
    return;
  }
  if (category === "TWENTY_FOUR_HR") {
    await scheduleCallback(
      lead,
      clientId,
      24 * 60,
      "TWENTY_FOUR_HR",
      `${dayLabel}: 24-hr follow-up (${status})`,
      scheduleOptions,
    );
    return;
  }
  if (category === "FORTY_EIGHT_HR") {
    await scheduleCallback(
      lead,
      clientId,
      48 * 60,
      "FORTY_EIGHT_HR",
      `${dayLabel}: 48-hr follow-up (${status})`,
      scheduleOptions,
    );
  }
};
// ---------------------------------------------------------------------------
// MAIN ENTRY POINT  (mirrors processRowObject_ / processLeadStatus)
// Called after every create or status update in the pixel_eye table.
// ---------------------------------------------------------------------------

export const processLeadStatus = async (lead, clientId, source) => {
  try {
    const callId = lead.call_id;
    const status = lead.status;
    const category = getStatusCategory(status);

    const existingState = await getLeadState(
      callId,
      clientId,
      lead?.phone_number,
      lead?.id,
    );

    if (!existingState) {
      if (category === "TERMINATION" || category === "NO_ACTION") {
        await cancelLeadState(
          callId,
          clientId,
          `Initial status: ${status}`,
          lead,
        );
        return;
      }

      // Mirror day_1 = status on first creation before scheduling.
      // FIX (Bug 3): Isolate mirrorDay1 so a DB error here cannot prevent
      // notification scheduling from running.
      await mirrorDay1(lead, null).catch((err) =>
        _logError("processLeadStatus:mirrorDay1:new", err, callId),
      );

      // For UNKNOWN status, create a baseline record with no schedule.
      if (category === "UNKNOWN" || category === "NO_REMINDER") {
        const normalizedPhoneNumber = normalizeLeadPhoneNumber(lead, null);
        await upsertLeadState(callId, clientId, {
          lead_id: lead?.id ?? null,
          customer_name: lead.customer_name,
          phone_number: normalizedPhoneNumber || lead.phone_number,
          normalized_phone_number: normalizedPhoneNumber,
          agent_name: lead.agent_name,
          last_status: status,
          state: "baseline",
          day1_mode: "auto",
        });
        return;
      }

      // For schedulable statuses, go directly to scheduling (1 DB write).
      await _scheduleForCategory(lead, clientId, category, status, null);
      return;
    }

    // ------------------------------------------------------------------
    // Permanently closed lead — keep it closed during normal status updates.
    // ------------------------------------------------------------------
    if (existingState.permanently_closed) {
      if (category === "TERMINATION" || category === "NO_ACTION") {
        await cancelLeadState(
          callId,
          clientId,
          `Status changed to: ${status}`,
          lead,
        );
        return;
      }
      await syncPermanentlyClosedLeadState(existingState, lead, status);
      console.log(
        `[PixelEye] Preserved permanently closed state for call_id=${callId} during status change to ${status}`,
      );
      return;
    }

    // ------------------------------------------------------------------
    // Status has not changed — just mirror day_1 if needed.
    // ------------------------------------------------------------------
    if (category === "TERMINATION" || category === "NO_ACTION") {
      await cancelLeadState(
        callId,
        clientId,
        `Status changed to: ${status}`,
        lead,
      );
      return;
    }

    const statusChanged =
      String(existingState.last_status || "").trim() !==
      String(status || "").trim();

    if (!statusChanged) {
      await mirrorDay1(lead, existingState).catch((err) =>
        _logError("processLeadStatus:mirrorDay1:nochange", err, callId),
      );
      return;
    }

    // ------------------------------------------------------------------
    // Status changed to a terminal state.
    // FIX (Bug 4): cancelLeadState already writes all fields including
    // last_status and customer details, so no separate existingState.update()
    // call is needed before it — that was an extra wasted DB write.
    // ------------------------------------------------------------------
    if (category === "TERMINATION" || category === "NO_ACTION") {
      await cancelLeadState(
        callId,
        clientId,
        `Status changed to: ${status}`,
        lead,
      );
      return;
    }

    // ------------------------------------------------------------------
    // Status changed to a schedulable state — update mirror fields first.
    // ------------------------------------------------------------------
    await existingState.update({
      lead_id: lead?.id ?? existingState.lead_id ?? null,
      last_status: status,
      customer_name: lead.customer_name,
      phone_number:
        normalizeLeadPhoneNumber(lead, existingState) || lead.phone_number,
      normalized_phone_number: normalizeLeadPhoneNumber(lead, existingState),
      agent_name: lead.agent_name,
    });

    // FIX (Bug 3): Isolate mirrorDay1 so a DB error cannot prevent scheduling.
    await mirrorDay1(lead, existingState).catch((err) =>
      _logError("processLeadStatus:mirrorDay1:changed", err, callId),
    );

    if (shouldPreserveActiveManualReminder(existingState)) {
      console.log(
        `[PixelEye] Preserved active MANUAL reminder for call_id=${callId} during status change to ${status}`,
      );
      return;
    }

    if (category === "UNKNOWN" || category === "NO_REMINDER") {
      await resetLeadStateToBaseline(lead, clientId, status);
      return;
    }

    await _scheduleForCategory(lead, clientId, category, status, existingState);
  } catch (err) {
    _logError("processLeadStatus", err, lead?.call_id);
    // Re-throw so the caller's .catch() can also see the error if needed.
    throw err;
  }
};

// Internal — decides delay and type then calls scheduleCallback.
const _scheduleForCategory = async (
  lead,
  clientId,
  category,
  status,
  existingState,
) => {
  if (category === "THIRTY_MIN") {
    // Mirrors handleThirtyMinuteStatus_:
    // If the first 30-min cycle already completed, do not reschedule 30-min.
    if (existingState?.thirty_min_cycle_completed) return;

    // Avoid duplicate scheduling when the same 30-min window is already pending.
    if (
      existingState?.state === "scheduled" &&
      existingState?.schedule_type === "THIRTY_MIN" &&
      !existingState?.notification_sent
    )
      return;

    await scheduleCallback(lead, clientId, 30, "THIRTY_MIN", "30-min callback");
    return;
  }

  if (category === "DNP2") {
    await scheduleCallback(
      lead,
      clientId,
      24 * 60,
      "DNP2",
      `${status} — 24-hr callback`,
    );
    return;
  }

  if (category === "TWENTY_FOUR_HR") {
    await scheduleCallback(
      lead,
      clientId,
      24 * 60,
      "TWENTY_FOUR_HR",
      `24-hr follow-up (${status})`,
    );
    return;
  }
  if (category === "FORTY_EIGHT_HR") {
    await scheduleCallback(
      lead,
      clientId,
      48 * 60,
      "FORTY_EIGHT_HR",
      `48-hr follow-up (${status})`,
    );
    return;
  }
};

// ---------------------------------------------------------------------------
// SEND DUE NOTIFICATIONS  (mirrors sendDueNotifications_)
// Called every minute by the cron scheduler.
// ---------------------------------------------------------------------------

export const sendDueNotifications = async () => {
  const startedAt = Date.now();
  try {
    const now = new Date();

    const dueStates = await db.PixelEyeLeadState.findAll({
      where: {
        state: "scheduled",
        notification_sent: false,
        permanently_closed: { [Op.not]: true },
        scheduled_at: { [Op.lte]: now },
        schedule_type: { [Op.in]: Array.from(ALLOWED_SCHEDULE_TYPES) },
      },
      order: [
        ["scheduled_at", "ASC"],
        ["createdAt", "ASC"],
      ],
      limit: DUE_NOTIFICATION_BATCH_LIMIT,
    });

    if (dueStates.length > 0) {
      console.log(
        `[PixelEye Scheduler] ${dueStates.length} notification(s) due at ${now.toISOString()}` +
          ` (limit=${DUE_NOTIFICATION_BATCH_LIMIT})`,
      );

      if (dueStates.length === DUE_NOTIFICATION_BATCH_LIMIT) {
        console.warn(
          `[PixelEye Scheduler] Due reminder batch reached limit=${DUE_NOTIFICATION_BATCH_LIMIT}.` +
            ` Remaining reminders will be processed on the next tick.`,
        );
      }
    }

    const dedupedDueStates = [];
    const seenDueKeys = new Set();

    for (const state of dueStates) {
      const key = state?.lead_id
        ? `lead:${state.client_id}:${state.lead_id}`
        : state?.normalized_phone_number
          ? `phone:${state.client_id}:${state.normalized_phone_number}`
          : `call:${state.client_id}:${state.call_id}`;

      if (seenDueKeys.has(key)) {
        continue;
      }

      seenDueKeys.add(key);
      dedupedDueStates.push(state);
    }

    for (const state of dedupedDueStates) {
      try {
        await _processDueState(state, now);
      } catch (err) {
        _logError("sendDueNotifications:item", err, state.call_id);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[PixelEye Scheduler] sendDueNotifications completed in ${durationMs}ms` +
        ` processed=${dueStates.length}`,
    );
  } catch (err) {
    _logError("sendDueNotifications:outer", err, null);
  }
};

const _processDueState = async (state, now) => {
  if (state.permanently_closed) {
    await state.update({
      state: "cancelled",
      cancel_reason: state.cancel_reason || "Follow-up permanently closed",
    });
    return;
  }

  // ------------------------------------------------------------------
  // BUG FIX: Prevent infinite retry loop.
  // If the notification has been overdue for more than 2 hours (webhook
  // persistently failing or misconfigured), mark it as cancelled so the
  // scheduler stops retrying and the row doesn't pile up indefinitely.
  // ------------------------------------------------------------------
  const overdueMs = now.getTime() - new Date(state.scheduled_at).getTime();
  if (overdueMs > NOTIFICATION_RETRY_WINDOW_MS) {
    await state.update({
      state: "cancelled",
      cancel_reason: `Notification retry window exceeded — overdue by ${Math.round(overdueMs / 60000)} min`,
    });
    console.warn(
      `[PixelEye] Cancelled notification for call_id=${state.call_id}` +
        ` — overdue by ${Math.round(overdueMs / 60000)} min (retry window exceeded).`,
    );
    return;
  }

  // Re-fetch the latest lead to get current status — agent may have updated it.
  const latestLead = await db.PixelEye.findOne({
    where: state.lead_id
      ? { id: state.lead_id, client_id: state.client_id }
      : { call_id: state.call_id, client_id: state.client_id },
  });

  if (!latestLead) {
    await state.update({
      state: "cancelled",
      cancel_reason: "Lead not found in pixel_eye table",
      permanently_closed: true,
    });
    return;
  }

  const latestCategory = getStatusCategory(latestLead.status);

  // If the agent has since moved the lead to a terminal status, cancel.
  if (latestCategory === "TERMINATION" || latestCategory === "NO_ACTION") {
    await state.update({
      state: "cancelled",
      cancel_reason: `Status changed to terminal before notification: ${latestLead.status}`,
      permanently_closed: true,
    });
    return;
  }

  const message = buildNotificationMessage(latestLead, state);
  await sendGoogleChatMessage(message);

  const isThirtyMin = state.schedule_type === "THIRTY_MIN";

  await state.update({
    notification_sent: true,
    notification_sent_at: new Date(),
    state: "completed",
    completion_source: "NOTIFICATION_SENT",
    thirty_min_cycle_completed:
      isThirtyMin || Boolean(state.thirty_min_cycle_completed),
    // Advance to next day so the system watches the next day field
    current_day: Math.min((state.current_day || 0) + 1, 5),
  });

  await cancelSiblingActiveLeadStates({
    clientId: state.client_id,
    leadId: state.lead_id ?? latestLead?.id ?? null,
    normalizedPhoneNumber:
      state.normalized_phone_number || latestLead?.normalized_phone_number,
    callId: state.call_id,
    keepId: state.id,
    cancelReason: `Notification sent for lead_id=${state.lead_id ?? latestLead?.id ?? "—"}`,
  });

  console.log(
    `[PixelEye] Notification sent for call_id=${state.call_id}` +
      ` schedule_type=${state.schedule_type} agent=${latestLead.agent_name || "—"}`,
  );
};

// ---------------------------------------------------------------------------
// GOOGLE CHAT MESSAGE  (mirrors buildGoogleChatMessage_ + sendGoogleChatMessage_)
// ---------------------------------------------------------------------------

export const buildNotificationMessage = (lead, state) => {
  const agentName = lead.agent_name || state.agent_name || "Unassigned Agent";
  const customerName =
    lead.customer_name || state.customer_name || "Not Available";
  const phone = lead.phone_number || state.phone_number || "Not Available";
  const scheduledAt = state.scheduled_at
    ? _formatDateTime(new Date(state.scheduled_at))
    : "—";

  return [
    "🚨 *CALL NOW – Agent Action Required*",
    "",
    `👤 *Agent Name:* ${agentName}`,
    `🆔 *Call ID:* ${lead.call_id}`,
    `🏥 *Customer Name:* ${customerName}`,
    `📞 *Phone Number:* ${phone}`,
    `📌 *Current Status:* ${lead.status}`,
    `📅 *Day:* ${state.current_day > 0 ? `Day ${state.current_day}` : "Initial"}`,
    `📌 *Reason:* ${state.reason || getScheduleTypeLabel(state.schedule_type)}`,
    `⏱ *Scheduled Time:* ${scheduledAt} ${TIMEZONE_LABEL}`,
    "",
    "👉 This is an internal task for the assigned agent only.",
    "Do not send any patient-facing message from this notification.",
  ].join("\n");
};

// FIX (Bug 2): Read GOOGLE_CHAT_WEBHOOK_URL at call time, not at module load
// time. With ESM, module bodies run during import resolution — before dotenv
// loads in app.js. Reading at the top-level would always capture an empty string.
export const sendGoogleChatMessage = async (text) => {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL || "";

  if (!webhookUrl) {
    throw new Error(
      "GOOGLE_CHAT_WEBHOOK_URL is not configured in environment.",
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    GOOGLE_CHAT_WEBHOOK_TIMEOUT_MS,
  );

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Google Chat webhook failed. Status: ${response.status}. Body: ${body}`,
      );
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Google Chat webhook timed out after ${GOOGLE_CHAT_WEBHOOK_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getScheduleTypeLabel = (scheduleType) => {
  switch (String(scheduleType || "").trim()) {
    case "THIRTY_MIN":
      return "30-Min Callback";
    case "DNP2":
      return "DNP2 — 24-Hour Callback";
    case "TWENTY_FOUR_HR":
      return "24-Hour Follow-up";
    case "FORTY_EIGHT_HR":
      return "48-Hour Follow-up";
    case "MANUAL":
      return "Manual Follow-up Reminder";
    default:
      return String(scheduleType || "—");
  }
};

// ---------------------------------------------------------------------------
// NOTIFICATION STATE QUERIES  (for Notification Tracker UI)
// ---------------------------------------------------------------------------

const TRACKER_DAY_FIELDS = ["day_1", "day_2", "day_3", "day_4", "day_5"];

const buildTrackerStateKey = (clientId, callId) =>
  `${clientId}:${String(callId || "").trim()}`;

const hasTrackerValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";

const getTrackerOutcomeStatus = (record) =>
  TRACKER_DAY_FIELDS.some((field) => hasTrackerValue(record?.[field]))
    ? "Outcome Updated"
    : "Outcome Pending";

const enrichNotificationStatesForTracker = async (clientId, states = []) => {
  const plainStates = states.map((state) =>
    typeof state?.toJSON === "function" ? state.toJSON() : state,
  );
  const dedupedStates = [];
  const seenStateKeys = new Set();

  for (const state of plainStates) {
    const key = state?.lead_id
      ? `lead:${state.client_id ?? clientId}:${state.lead_id}`
      : state?.normalized_phone_number
        ? `phone:${state.client_id ?? clientId}:${state.normalized_phone_number}`
        : `call:${state.client_id ?? clientId}:${String(state?.call_id || "").trim()}`;

    if (seenStateKeys.has(key)) {
      continue;
    }

    seenStateKeys.add(key);
    dedupedStates.push(state);
  }

  const leadIds = [
    ...new Set(
      dedupedStates
        .map((state) => Number(state?.lead_id || 0) || null)
        .filter(Boolean),
    ),
  ];

  const callIds = [
    ...new Set(
      dedupedStates
        .map((state) => String(state?.call_id || "").trim())
        .filter(Boolean),
    ),
  ];

  if (leadIds.length === 0 && callIds.length === 0) {
    return dedupedStates.map((state) => ({
      ...state,
      compliance_status: null,
      day_1: null,
      day_2: null,
      day_3: null,
      day_4: null,
      day_5: null,
      outcome_status: "Outcome Pending",
    }));
  }

  const [complianceRows, leadRows] = await Promise.all([
    db.PixelEyeFollowUpCallCompliance.findAll({
      where: {
        client_id: clientId,
        call_id: { [Op.in]: callIds },
      },
      attributes: [
        "client_id",
        "lead_id",
        "call_id",
        "normalized_phone_number",
        "compliance_status",
      ],
      order: [
        ["updatedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
      raw: true,
    }),
    db.PixelEye.findAll({
      where:
        leadIds.length > 0
          ? {
              client_id: clientId,
              id: { [Op.in]: leadIds },
            }
          : {
              client_id: clientId,
              call_id: { [Op.in]: callIds },
            },
      attributes: [
        "id",
        "client_id",
        "call_id",
        "normalized_phone_number",
        ...TRACKER_DAY_FIELDS,
      ],
      raw: true,
    }),
  ]);

  const buildTrackerIdentityKeys = (row, fallbackClientId) => {
    const keys = [];

    if (row?.lead_id) {
      keys.push(`lead:${row.client_id ?? fallbackClientId}:${row.lead_id}`);
    }

    if (row?.normalized_phone_number) {
      keys.push(
        `phone:${row.client_id ?? fallbackClientId}:${row.normalized_phone_number}`,
      );
    }

    if (row?.call_id) {
      keys.push(
        buildTrackerStateKey(row.client_id ?? fallbackClientId, row.call_id),
      );
    }

    return [...new Set(keys)];
  };

  const complianceMap = new Map();
  for (const row of complianceRows) {
    for (const key of buildTrackerIdentityKeys(row, clientId)) {
      if (!complianceMap.has(key)) {
        complianceMap.set(key, row);
      }
    }
  }

  const leadMap = new Map();
  for (const row of leadRows) {
    for (const key of buildTrackerIdentityKeys(row, clientId)) {
      if (!leadMap.has(key)) {
        leadMap.set(key, row);
      }
    }
  }

  return dedupedStates.map((state) => {
    const stateKey = state?.lead_id
      ? `lead:${state.client_id ?? clientId}:${state.lead_id}`
      : state?.normalized_phone_number
        ? `phone:${state.client_id ?? clientId}:${state.normalized_phone_number}`
        : buildTrackerStateKey(state.client_id ?? clientId, state.call_id);

    const leadRow = leadMap.get(stateKey) || null;
    const compliance = complianceMap.get(stateKey) || null;

    const enriched = {
      ...state,
      compliance_status: compliance?.compliance_status ?? null,
      day_1: leadRow?.day_1 ?? null,
      day_2: leadRow?.day_2 ?? null,
      day_3: leadRow?.day_3 ?? null,
      day_4: leadRow?.day_4 ?? null,
      day_5: leadRow?.day_5 ?? null,
    };

    enriched.outcome_status = getTrackerOutcomeStatus(enriched);

    return enriched;
  });
};

export const listNotificationStates = async (clientId, filters = {}) => {
  const where = { client_id: clientId };

  if (filters.state) where.state = filters.state;
  if (filters.schedule_type) where.schedule_type = filters.schedule_type;

  const states = await db.PixelEyeLeadState.findAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: filters.limit ? parseInt(filters.limit, 10) : 200,
  });

  return await enrichNotificationStatesForTracker(clientId, states);
};

export const deleteNotificationStates = async (
  clientId,
  notificationIds = [],
) => {
  const ids = Array.from(
    new Set(
      (Array.isArray(notificationIds) ? notificationIds : [notificationIds])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );

  if (ids.length === 0) {
    throw new Error("At least one notification id is required.");
  }

  const deletedCount = await db.PixelEyeLeadState.destroy({
    where: {
      client_id: clientId,
      id: { [Op.in]: ids },
    },
  });

  return {
    requestedCount: ids.length,
    deletedCount,
  };
};

export const getNotificationSummary = async (clientId) => {
  const [total, scheduled, completed, cancelled] = await Promise.all([
    db.PixelEyeLeadState.count({ where: { client_id: clientId } }),
    db.PixelEyeLeadState.count({
      where: {
        client_id: clientId,
        state: "scheduled",
        notification_sent: false,
      },
    }),
    db.PixelEyeLeadState.count({
      where: { client_id: clientId, state: "completed" },
    }),
    db.PixelEyeLeadState.count({
      where: { client_id: clientId, state: "cancelled" },
    }),
  ]);

  return { total, scheduled, completed, cancelled };
};

// ---------------------------------------------------------------------------
// UTILITY
// ---------------------------------------------------------------------------

const _formatDateTime = (dateObj) => formatAppDateTime(dateObj);

const _logError = (fn, err, callId) => {
  console.error(
    JSON.stringify({
      fn,
      call_id: callId || null,
      error: err?.message,
      stack: err?.stack,
      time: new Date().toISOString(),
    }),
  );
};
