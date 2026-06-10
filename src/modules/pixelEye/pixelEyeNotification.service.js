/**
 * Pixel Eye Notification Service
 *
 * Translates the Google Apps Script hospital call tracking system into
 * the Node.js / MySQL stack. State that the script stored in
 * PropertiesService is stored here in pixel_eye_lead_states.
 *
 * Status categories and callback windows match the reference script exactly:
 *   THIRTY_MIN     → notify agent 30 minutes after status set
 *   DNP2           → notify agent 24 hours after status set
 *   TWENTY_FOUR_HR → notify agent 24 hours after status set
 *   MANUAL         → notify agent at the manually selected follow-up time
 *   TERMINATION    → cancel all pending callbacks permanently
 *   NO_ACTION      → success states, nothing scheduled
 */

import { Op } from "sequelize";
import db from "../../database/index.js";

const TIMEZONE_LABEL = "IST";
const GOOGLE_CHAT_WEBHOOK_TIMEOUT_MS = 15_000;

// How long past the scheduled_at time we will keep retrying before giving up.
// Prevents an infinite retry loop if the webhook is permanently unavailable.
const NOTIFICATION_RETRY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// STATUS CATEGORY MAPPING
// Mirrors getStatusCategory_() from the reference script,
// mapped to our exact STATUS_ENUM_VALUES.
// ---------------------------------------------------------------------------

const THIRTY_MIN_STATUSES = new Set([
  "Busy",
  "Not Answering",
  "Switched Off",
  "Missed Call",
  "On Another Call",
  "DND",
  "Not Speaking",
  "Disconnecting",
  "Not in Network",
  "Incoming Call Not Available",
]);

const DNP_STATUSES = new Set([
  "Dnp 1",
  "Dnp 2",
  "Dnp 3",
  "Dnp 4",
]);

const TWENTY_FOUR_HR_STATUSES = new Set([
  "Enquiry",
  "Hot Follow-up",
  "Follow-up Required",
  "Will Call Later",
  "Rescheduling",
  "Doctor Time",
  "Follow-up Post Appointment",
  "Want to Speak With Doctor",
  "Appointment Cancelled",
  "Address Requested",
  "Searching for Specific Hospital",
  "Others",
]);

const ALLOWED_SCHEDULE_TYPES = new Set([
  "THIRTY_MIN",
  "DNP2",
  "TWENTY_FOUR_HR",
  "MANUAL",
]);

const DUE_NOTIFICATION_BATCH_LIMIT = 50;

const TERMINATION_STATUSES = new Set([
  "Wrong Number",
  "Wrongly Dialed",
  "Fraud Call",
  "Not Interested",
  "Not Willing to Come Now",
  "Going to Other Hospital",
  "Not in Hyderabad",
  "Long Distance",
  "Number Not in Service",
  "Walk-in",
  "Closed",
]);

// Appointment Fixed and Visited → lead is won, no further callbacks needed.
const NO_ACTION_STATUSES = new Set([
  "Appointment Fixed",
  "Visited",
]);

const makeLowercaseSet = (s) => new Set([...s].map(val => val.toLowerCase().trim()));

const THIRTY_MIN_STATUSES_LOWER     = makeLowercaseSet(THIRTY_MIN_STATUSES);
const DNP_STATUSES_LOWER            = makeLowercaseSet(DNP_STATUSES);
const TWENTY_FOUR_HR_STATUSES_LOWER = makeLowercaseSet(TWENTY_FOUR_HR_STATUSES);
const TERMINATION_STATUSES_LOWER   = makeLowercaseSet(TERMINATION_STATUSES);
const NO_ACTION_STATUSES_LOWER      = makeLowercaseSet(NO_ACTION_STATUSES);

export const getStatusCategory = (status) => {
  const s = String(status || "").trim().toLowerCase();
  if (TERMINATION_STATUSES_LOWER.has(s))    return "TERMINATION";
  if (DNP_STATUSES_LOWER.has(s))            return "DNP2";
  if (THIRTY_MIN_STATUSES_LOWER.has(s))     return "THIRTY_MIN";
  if (TWENTY_FOUR_HR_STATUSES_LOWER.has(s)) return "TWENTY_FOUR_HR";
  if (NO_ACTION_STATUSES_LOWER.has(s))      return "NO_ACTION";
  return "UNKNOWN";
};

// ---------------------------------------------------------------------------
// STATE HELPERS  (mirrors getState_ / saveState_ / createEmptyState_)
// ---------------------------------------------------------------------------

const getLeadState = async (callId, clientId) => {
  return await db.PixelEyeLeadState.findOne({
    where: { call_id: callId, client_id: clientId },
  });
};

export const isTerminalLeadStatus = (status) => {
  const category = getStatusCategory(status);
  return category === "TERMINATION" || category === "NO_ACTION";
};

export const resolveManualFollowUpScheduledAt = (followUpDate) => {
  const text = String(followUpDate || "").trim();

  if (!text) {
    return null;
  }

  let scheduledAt;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    scheduledAt = new Date(`${text}T09:00:00+05:30`);
  } else if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(text)) {
    scheduledAt = new Date(text.replace(" ", "T"));
  } else {
    scheduledAt = new Date(text);
  }

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Invalid follow_up_date");
  }

  return scheduledAt;
};

const normalizeScheduledAt = (scheduledAt) => {
  const nextScheduledAt =
    scheduledAt instanceof Date ? new Date(scheduledAt.getTime()) : new Date(scheduledAt);

  if (Number.isNaN(nextScheduledAt.getTime())) {
    throw new Error("Invalid scheduledAt value for manual follow-up reminder");
  }

  return nextScheduledAt;
};

// FIX (Bug 1): Use the `created` boolean returned by findOrCreate instead of
// the private `row._options.isNewRecord` internal Sequelize property.
const upsertLeadState = async (callId, clientId, fields) => {
  const [row, created] = await db.PixelEyeLeadState.findOrCreate({
    where: { call_id: callId, client_id: clientId },
    defaults: {
      call_id:   callId,
      client_id: clientId,
      state:     "new",
      day1_mode: "manual",
      current_day: 0,
      notification_sent:          false,
      thirty_min_cycle_completed: false,
      permanently_closed:         false,
      ...fields,
    },
  });

  if (!created) {
    await row.update(fields);
  }

  return row;
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

const scheduleCallback = async (lead, clientId, delayMinutes, type, reason) => {
  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

  await upsertLeadState(lead.call_id, clientId, {
    customer_name:        lead.customer_name,
    phone_number:         lead.phone_number,
    agent_name:           lead.agent_name,
    last_status:          lead.status,
    state:                "scheduled",
    schedule_type:        type,
    reason:               reason,
    scheduled_at:         scheduledAt,
    notification_sent:    false,
    notification_sent_at: null,
    permanently_closed:   false,
    cancel_reason:        null,
  });

  console.log(
    `[PixelEye] Scheduled ${type} callback for call_id=${lead.call_id}` +
    ` at ${scheduledAt.toISOString()} (in ${delayMinutes} min)`,
  );
};

export const scheduleManualFollowUpReminder = async (lead, scheduledAt, options = {}) => {
  const clientId = Number(options.clientId ?? lead?.client_id);
  const callId = String(options.callId ?? lead?.call_id ?? "").trim();
  const scheduledDate = normalizeScheduledAt(scheduledAt);
  const reason = String(
    options.reason || "Manual Follow-up Reminder",
  ).trim() || "Manual Follow-up Reminder";

  if (!clientId) {
    throw new Error("Missing client context for manual follow-up reminder");
  }

  if (!callId) {
    throw new Error("Missing call_id for manual follow-up reminder");
  }

  const existingState = await getLeadState(callId, clientId);
  const payload = {
    customer_name:        lead?.customer_name ?? existingState?.customer_name ?? null,
    phone_number:         lead?.phone_number ?? existingState?.phone_number ?? null,
    agent_name:           lead?.agent_name ?? existingState?.agent_name ?? null,
    last_status:          lead?.status ?? existingState?.last_status ?? null,
    state:                "scheduled",
    schedule_type:        "MANUAL",
    reason,
    scheduled_at:         scheduledDate,
    notification_sent:    false,
    notification_sent_at: null,
    permanently_closed:   false,
    cancel_reason:        null,
    current_day:          null,
  };

  let state;
  if (!existingState) {
    state = await db.PixelEyeLeadState.create({
      client_id: clientId,
      call_id: callId,
      ...payload,
    });
  } else {
    state = await existingState.update(payload);
  }

  console.log(
    `[PixelEye] Scheduled MANUAL follow-up reminder for call_id=${callId}` +
    ` at ${scheduledDate.toISOString()}`,
  );

  return state;
};

export const markFollowUpReminderHandled = async (lead, options = {}) => {
  const clientId = Number(options.clientId ?? lead?.client_id);
  const callId = String(options.callId ?? lead?.call_id ?? "").trim();

  if (!clientId) {
    throw new Error("Missing client context for follow-up handling");
  }

  if (!callId) {
    throw new Error("Missing call_id for follow-up handling");
  }

  const existingState = await getLeadState(callId, clientId);
  if (!existingState || existingState.state !== "scheduled") {
    throw new Error("No active follow-up reminder found");
  }

  const handledState = await existingState.update({
    state: "completed",
  });

  console.log(
    `[PixelEye] Marked follow-up reminder handled for call_id=${callId}`,
  );

  return handledState;
};

const cancelLeadState = async (callId, clientId, reason, lead) => {
  await upsertLeadState(callId, clientId, {
    ...(lead ? {
      customer_name: lead.customer_name,
      phone_number:  lead.phone_number,
      agent_name:    lead.agent_name,
      last_status:   lead.status,
    } : {}),
    state:              "cancelled",
    schedule_type:      null,
    reason:             null,
    scheduled_at:       null,
    notification_sent:  false,
    permanently_closed: true,
    cancel_reason:      reason,
  });
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
export const processDayStatus = async (lead, clientId, dayNumber, dayValue) => {
  try {
    const callId   = lead.call_id;
    const category = getStatusCategory(dayValue);

    const existingState = await getLeadState(callId, clientId);

    // ── No state row yet (unlikely for day updates, but safe) ──
    if (!existingState) {
      if (category === "TERMINATION" || category === "NO_ACTION") {
        await cancelLeadState(callId, clientId, `Day ${dayNumber}: ${dayValue}`, lead);
        return;
      }
      if (category === "UNKNOWN") {
        await upsertLeadState(callId, clientId, {
          customer_name: lead.customer_name, phone_number: lead.phone_number,
          agent_name: lead.agent_name, last_status: dayValue,
          state: "baseline", current_day: dayNumber,
        });
        return;
      }
      await _scheduleForDayCategory(lead, clientId, category, dayValue, dayNumber, null);
      return;
    }

    // ── Permanently closed lead — reopen if a schedulable status is set ──
    if (existingState.permanently_closed) {
      if (category !== "TERMINATION" && category !== "NO_ACTION" && category !== "UNKNOWN") {
        await existingState.update({
          permanently_closed: false,
          cancel_reason: null,
        });
      } else {
        return;
      }
    }

    // ── Only process if this day is >= current_day (no going backwards) ──
    if (dayNumber < existingState.current_day) return;

    // ── Terminal / Success status on this day → cancel everything ──
    if (category === "TERMINATION" || category === "NO_ACTION") {
      await cancelLeadState(callId, clientId, `Day ${dayNumber} status: ${dayValue}`, lead);
      return;
    }

    // ── Update state and schedule ──
    await existingState.update({
      last_status: dayValue, current_day: dayNumber,
      customer_name: lead.customer_name, phone_number: lead.phone_number,
      agent_name: lead.agent_name,
    });

    await _scheduleForDayCategory(lead, clientId, category, dayValue, dayNumber, existingState);

  } catch (err) {
    _logError("processDayStatus", err, lead?.call_id);
    throw err;
  }
};

const _scheduleForDayCategory = async (lead, clientId, category, status, dayNumber, existingState) => {
  const dayLabel = `Day ${dayNumber}`;

  if (category === "THIRTY_MIN") {
    if (
      existingState?.state === "scheduled" &&
      existingState?.schedule_type === "THIRTY_MIN" &&
      existingState?.current_day === dayNumber &&
      !existingState?.notification_sent
    ) return; // Avoid duplicate
    await scheduleCallback(lead, clientId, 30, "THIRTY_MIN", `${dayLabel}: 30-min callback`);
    return;
  }
  if (category === "DNP2") {
    await scheduleCallback(lead, clientId, 24 * 60, "DNP2", `${dayLabel}: DNP2 — 24-hr callback`);
    return;
  }
  if (category === "TWENTY_FOUR_HR") {
    await scheduleCallback(lead, clientId, 24 * 60, "TWENTY_FOUR_HR", `${dayLabel}: 24-hr follow-up (${status})`);
    return;
  }
};

// ---------------------------------------------------------------------------
// MAIN ENTRY POINT  (mirrors processRowObject_ / processLeadStatus)
// Called after every create or status update in the pixel_eye table.
// ---------------------------------------------------------------------------

export const processLeadStatus = async (lead, clientId, source) => {
  try {
    const callId   = lead.call_id;
    const status   = lead.status;
    const category = getStatusCategory(status);

    const existingState = await getLeadState(callId, clientId);

    // ------------------------------------------------------------------
    // New lead — no state row exists yet.
    // FIX (Bug 5): Skip creating a baseline row that would immediately
    // be overwritten. Go straight to scheduling so only 1 DB write happens.
    // ------------------------------------------------------------------
    if (!existingState) {
      if (category === "TERMINATION" || category === "NO_ACTION") {
        await cancelLeadState(callId, clientId, `Initial status: ${status}`, lead);
        return;
      }

      // Mirror day_1 = status on first creation before scheduling.
      // FIX (Bug 3): Isolate mirrorDay1 so a DB error here cannot prevent
      // notification scheduling from running.
      await mirrorDay1(lead, null).catch((err) =>
        _logError("processLeadStatus:mirrorDay1:new", err, callId),
      );

      // For UNKNOWN status, create a baseline record with no schedule.
      if (category === "UNKNOWN") {
        await upsertLeadState(callId, clientId, {
          customer_name: lead.customer_name,
          phone_number:  lead.phone_number,
          agent_name:    lead.agent_name,
          last_status:   status,
          state:         "baseline",
          day1_mode:     "auto",
        });
        return;
      }

      // For schedulable statuses, go directly to scheduling (1 DB write).
      await _scheduleForCategory(lead, clientId, category, status, null);
      return;
    }

    // ------------------------------------------------------------------
    // Permanently closed lead — reopen if a schedulable status is set.
    // ------------------------------------------------------------------
    if (existingState.permanently_closed) {
      if (category !== "TERMINATION" && category !== "NO_ACTION" && category !== "UNKNOWN") {
        await existingState.update({
          permanently_closed: false,
          cancel_reason: null,
        });
      } else {
        return;
      }
    }

    // ------------------------------------------------------------------
    // Status has not changed — just mirror day_1 if needed.
    // ------------------------------------------------------------------
    if (category === "TERMINATION" || category === "NO_ACTION") {
      await cancelLeadState(callId, clientId, `Status changed to: ${status}`, lead);
      return;
    }

    const statusChanged =
      String(existingState.last_status || "").trim() !== String(status || "").trim();

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
      await cancelLeadState(callId, clientId, `Status changed to: ${status}`, lead);
      return;
    }

    // ------------------------------------------------------------------
    // Status changed to a schedulable state — update mirror fields first.
    // ------------------------------------------------------------------
    await existingState.update({
      last_status:   status,
      customer_name: lead.customer_name,
      phone_number:  lead.phone_number,
      agent_name:    lead.agent_name,
    });

    // FIX (Bug 3): Isolate mirrorDay1 so a DB error cannot prevent scheduling.
    await mirrorDay1(lead, existingState).catch((err) =>
      _logError("processLeadStatus:mirrorDay1:changed", err, callId),
    );

    await _scheduleForCategory(lead, clientId, category, status, existingState);

  } catch (err) {
    _logError("processLeadStatus", err, lead?.call_id);
    // Re-throw so the caller's .catch() can also see the error if needed.
    throw err;
  }
};

// Internal — decides delay and type then calls scheduleCallback.
const _scheduleForCategory = async (lead, clientId, category, status, existingState) => {
  if (category === "THIRTY_MIN") {
    // Mirrors handleThirtyMinuteStatus_:
    // If the first 30-min cycle already completed, do not reschedule 30-min.
    if (existingState?.thirty_min_cycle_completed) return;

    // Avoid duplicate scheduling when the same 30-min window is already pending.
    if (
      existingState?.state === "scheduled" &&
      existingState?.schedule_type === "THIRTY_MIN" &&
      !existingState?.notification_sent
    ) return;

    await scheduleCallback(lead, clientId, 30, "THIRTY_MIN", "30-min callback");
    return;
  }

  if (category === "DNP2") {
    await scheduleCallback(lead, clientId, 24 * 60, "DNP2", `${status} — 24-hr callback`);
    return;
  }

  if (category === "TWENTY_FOUR_HR") {
    await scheduleCallback(lead, clientId, 24 * 60, "TWENTY_FOUR_HR", `24-hr follow-up (${status})`);
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
        state:             "scheduled",
        notification_sent: false,
        permanently_closed: { [Op.not]: true },
        scheduled_at:      { [Op.lte]: now },
        schedule_type:     { [Op.in]: Array.from(ALLOWED_SCHEDULE_TYPES) },
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

    for (const state of dueStates) {
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
      state:        "cancelled",
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
    where: { call_id: state.call_id, client_id: state.client_id },
  });

  if (!latestLead) {
    await state.update({
      state:              "cancelled",
      cancel_reason:      "Lead not found in pixel_eye table",
      permanently_closed: true,
    });
    return;
  }

  const latestCategory = getStatusCategory(latestLead.status);

  // If the agent has since moved the lead to a terminal status, cancel.
  if (latestCategory === "TERMINATION" || latestCategory === "NO_ACTION") {
    await state.update({
      state:              "cancelled",
      cancel_reason:      `Status changed to terminal before notification: ${latestLead.status}`,
      permanently_closed: true,
    });
    return;
  }

  const message = buildNotificationMessage(latestLead, state);
  await sendGoogleChatMessage(message);

  const isThirtyMin = state.schedule_type === "THIRTY_MIN";

  await state.update({
    notification_sent:    true,
    notification_sent_at: new Date(),
    state:                "completed",
    // Advance to next day so the system watches the next day field
    current_day: Math.min((state.current_day || 0) + 1, 5),
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
  const agentName    = lead.agent_name    || state.agent_name    || "Unassigned Agent";
  const customerName = lead.customer_name || state.customer_name || "Not Available";
  const phone        = lead.phone_number  || state.phone_number  || "Not Available";
  const scheduledAt  = state.scheduled_at
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
    throw new Error("GOOGLE_CHAT_WEBHOOK_URL is not configured in environment.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GOOGLE_CHAT_WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
      signal:  controller.signal,
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
    case "MANUAL":
      return "Manual Follow-up Reminder";
    default:
      return String(scheduleType || "—");
  }
};

// ---------------------------------------------------------------------------
// NOTIFICATION STATE QUERIES  (for Notification Tracker UI)
// ---------------------------------------------------------------------------

export const listNotificationStates = async (clientId, filters = {}) => {
  const where = { client_id: clientId };

  if (filters.state) where.state = filters.state;
  if (filters.schedule_type) where.schedule_type = filters.schedule_type;

  return await db.PixelEyeLeadState.findAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: filters.limit ? parseInt(filters.limit, 10) : 200,
  });
};

export const getNotificationSummary = async (clientId) => {
  const [total, scheduled, completed, cancelled] = await Promise.all([
    db.PixelEyeLeadState.count({ where: { client_id: clientId } }),
    db.PixelEyeLeadState.count({
      where: { client_id: clientId, state: "scheduled", notification_sent: false },
    }),
    db.PixelEyeLeadState.count({ where: { client_id: clientId, state: "completed" } }),
    db.PixelEyeLeadState.count({ where: { client_id: clientId, state: "cancelled" } }),
  ]);

  return { total, scheduled, completed, cancelled };
};

// ---------------------------------------------------------------------------
// UTILITY
// ---------------------------------------------------------------------------

const _formatDateTime = (dateObj) => {
  return dateObj.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day:      "2-digit",
    month:    "short",
    year:     "numeric",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   true,
  });
};

const _logError = (fn, err, callId) => {
  console.error(
    JSON.stringify({
      fn,
      call_id: callId || null,
      error:   err?.message,
      stack:   err?.stack,
      time:    new Date().toISOString(),
    }),
  );
};
