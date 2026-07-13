import { Op } from "sequelize";
import db from "../../../database/index.js";
import {
  extractClientModuleKey,
  normalizeClientKey,
} from "../../../utils/clientKey.js";
import {
  processLeadStatus,
  scheduleManualFollowUpReminder,
  isTerminalLeadStatus,
  resolveManualFollowUpScheduledAt,
} from "../pixelEyeNotification.service.js";
import { createFollowUpHistoryEntry } from "../pixelEyeFollowUpHistory.service.js";
import { createPixelEyeCallLog } from "../pixelEyeCallLog.service.js";
import {
  findPixelEyeLeadByPhone,
  isPixelEyeLeadActive,
  applyPixelEyeFollowUpOutcome,
} from "../pixelEye.service.js";
import {
  createOrUpdatePendingFollowUpCompliance,
  findPendingComplianceForCallLog,
  markComplianceAsCalled,
} from "../pixelEyeFollowUpCallCompliance.service.js";
import { normalizePixelEyePhoneNumber } from "../pixelEyePhoneNumber.js";

const RUNO_SERVICE_NAME = "Runo";
const DEFAULT_WEBHOOK_CLIENT_KEY = "pixeleye";
const NORMAL_LEAD_ATTENTION_STATE = "SAME_NUMBER_OUTCOME_PENDING";
const NORMAL_LEAD_ATTENTION_LABEL = "Repeat Caller - Update Outcome";

const createWebhookError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getNormalizedServiceCallId = (payload) => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const rawCallId = payload.call_id ?? payload.callId;
  if (rawCallId === undefined || rawCallId === null) {
    return undefined;
  }

  const text = String(rawCallId).trim();
  return text || undefined;
};

const resolveClientIdFromKey = async (clientKeyRaw) => {
  const clientKey = normalizeClientKey(clientKeyRaw);
  if (!clientKey) return null;

  const exactClient = await db.Client.findOne({
    where: { client_key: clientKey },
  });

  if (exactClient) {
    return exactClient.id;
  }

  const moduleKey = extractClientModuleKey(clientKey);
  if (!moduleKey || moduleKey !== clientKey) {
    return null;
  }

  const matchedClients = await db.Client.findAll({
    where: {
      client_key: {
        [Op.like]: `${moduleKey}_%`,
      },
    },
    order: [["id", "ASC"]],
  });

  if (matchedClients.length === 1) {
    return matchedClients[0].id;
  }

  return null;
};

const resolveWebhookClientId = async (payload) => {
  const clientKey =
    payload?._client_key ||
    payload?.client_key ||
    process.env.RUNO_WEBHOOK_CLIENT_KEY ||
    DEFAULT_WEBHOOK_CLIENT_KEY;

  return await resolveClientIdFromKey(clientKey);
};

const buildPixelEyeLeadData = (payload) => {
  const normalizedPhoneNumber = normalizePixelEyePhoneNumber(
    payload?.phone_number ||
      payload?.customer_phone ||
      payload?.customerPhone ||
      payload?.customer?.phoneNumber,
  );

  return {
    date: payload.date,
    time: payload.time,
    call_id: payload.call_id,
    customer_name: payload.customer_name,
    phone_number: normalizedPhoneNumber || payload.phone_number,
    normalized_phone_number: normalizedPhoneNumber,
    agent_name: payload.assigned_to || payload.agent_name || null,
    source: payload.source || RUNO_SERVICE_NAME,
    type_of_enquiry: payload.type_of_enquiry || null,
    follow_up_date: payload.follow_up_date || null,
    status: payload.status,
  };
};

const logWebhookFollowUpSkip = (callId, reason) => {
  console.log(
    `[PixelEye] Skipped webhook manual follow-up scheduling for call_id=${callId || "—"}: ${reason}`,
  );
};

const scheduleWebhookManualFollowUpIfEligible = async (lead, followUpDate) => {
  if (!String(followUpDate || "").trim()) {
    return false;
  }

  if (!lead?.client_id || !lead?.call_id) {
    logWebhookFollowUpSkip(lead?.call_id, "missing client_id or call_id");
    return false;
  }

  if (isTerminalLeadStatus(lead?.status)) {
    logWebhookFollowUpSkip(lead?.call_id, `terminal status=${lead?.status}`);
    return false;
  }

  let scheduledAt;
  try {
    scheduledAt = resolveManualFollowUpScheduledAt(followUpDate);
  } catch (err) {
    logWebhookFollowUpSkip(lead?.call_id, err.message);
    return false;
  }

  if (scheduledAt.getTime() <= Date.now()) {
    logWebhookFollowUpSkip(
      lead?.call_id,
      "follow_up_date must be in the future",
    );
    return false;
  }

  await scheduleManualFollowUpReminder(lead, scheduledAt, {
    clientId: lead.client_id,
    callId: lead.call_id,
    reason: "Manual Follow-up Reminder",
  });

  console.log(
    `[PixelEye] Webhook manual follow-up scheduled for call_id=${lead.call_id} at ${scheduledAt.toISOString()}`,
  );

  return true;
};

const createWebhookFollowUpHistoryEntry = async ({
  lead,
  oldFollowUpDate,
  newFollowUpDate,
  reason,
}) => {
  return await createFollowUpHistoryEntry({
    client_id: lead?.client_id,
    lead_id: lead?.id,
    call_id: lead?.call_id,
    phone_number: lead?.phone_number,
    customer_name: lead?.customer_name,
    old_follow_up_date: oldFollowUpDate ?? null,
    new_follow_up_date: newFollowUpDate ?? null,
    change_type: "AUTO_FROM_WEBHOOK",
    source: "RUNO_WEBHOOK",
    reason,
    changed_by_user_id: null,
    changed_by_name: "Runo Webhook",
  });
};

const persistWebhookCallLog = async ({
  payload,
  lead,
  clientId,
  callId,
  transaction = null,
  outcomeDayNumber = null,
  outcomeStatus = null,
  outcomeAppliedAt = null,
  rawPayloadPatch = null,
}) => {
  const mergedRawPayload =
    rawPayloadPatch && typeof rawPayloadPatch === "object"
      ? { ...(payload || {}), ...rawPayloadPatch }
      : payload;

  const callLog = await createPixelEyeCallLog({
    client_id: clientId,
    lead_id: lead?.id ?? null,
    call_id: callId || payload?.call_id,
    phone_number: payload?.phone_number,
    customer_name: payload?.customer_name,
    agent_name: payload?.assigned_to || payload?.agent_name || null,
    date: payload?.date,
    time: payload?.time,
    status: payload?.status,
    source: "RUNO_WEBHOOK",
    raw_payload: mergedRawPayload,
    direction: payload?.direction || payload?.call_direction || null,
    duration_seconds:
      payload?.duration_seconds ??
      payload?.duration ??
      payload?.call_duration ??
      null,
    recording_url:
      payload?.recording_url ||
      payload?.call_recording ||
      payload?.recording ||
      null,
    disposition: payload?.disposition || payload?.status || null,
    outcome_day_number: outcomeDayNumber,
    outcome_status: outcomeStatus,
    outcome_applied_at: outcomeAppliedAt,
    transaction,
  });

  if (!callLog) {
    console.error(
      `[PixelEye] Failed to persist call log for call_id=${payload?.call_id || "—"}`,
    );
  }

  return callLog;
};

const buildWebhookTenantContext = (clientId) => ({
  id: clientId,
  isSuperAdmin: false,
  role: "client",
});

const isActiveManualFollowUpWebhookLead = async (lead) => {
  if (!lead?.id || !String(lead?.follow_up_date || "").trim()) {
    return false;
  }

  return await isPixelEyeLeadActive(lead);
};

const findExistingWebhookCallLog = async (clientId, callId) => {
  if (!clientId || !callId) {
    return null;
  }

  return await db.PixelEyeCallLog.findOne({
    where: {
      client_id: clientId,
      call_id: callId,
    },
  });
};

const hasAppliedWebhookOutcome = (callLog) =>
  Boolean(callLog?.outcome_applied_at);

const applyWebhookOutcomeToNextDay = async ({
  lead,
  clientId,
  status,
  callId,
  existingCallLog,
  transaction,
}) => {
  if (!lead?.id || !clientId || !status) {
    return {
      applied: false,
      lead,
    };
  }

  if (hasAppliedWebhookOutcome(existingCallLog)) {
    console.log(
      `[PixelEye] Skipped webhook day outcome for call_id=${callId || lead?.call_id || "—"}: outcome already applied`,
    );

    return {
      applied: false,
      lead,
      skipped: "already_applied",
    };
  }

  try {
    const outcome = await applyPixelEyeFollowUpOutcome(
      lead.id,
      status,
      buildWebhookTenantContext(clientId),
      transaction,
    );

    return {
      applied: true,
      lead: outcome?.lead ?? lead,
      outcome,
    };
  } catch (err) {
    if (
      err?.message === "Outcome flow is already completed." ||
      err?.message?.includes("Selected status is not allowed for Day")
    ) {
      throw createWebhookError(err.message, 400);
    }

    console.log(
      `[PixelEye] Skipped webhook day outcome for call_id=${callId || lead?.call_id || "—"}: ${err.message}`,
    );
    return {
      applied: false,
      lead,
      skipped: err.message,
    };
  }
};

const runWebhookActiveLeadUpdate = async ({
  lead,
  clientId,
  payload,
  leadData,
  existingCallLog,
}) => {
  if (!lead?.id || !clientId) {
    return {
      lead,
      callLog: null,
      outcomeResult: { applied: false, lead },
      skipped: "missing lead or client",
    };
  }

  const manualFollowUpActive = await isActiveManualFollowUpWebhookLead(lead);
  const attentionPatch = {
    attention_state: NORMAL_LEAD_ATTENTION_STATE,
    attention_label: NORMAL_LEAD_ATTENTION_LABEL,
    attention_source: "WEBHOOK",
    attention_created_at: new Date().toISOString(),
  };

  if (hasAppliedWebhookOutcome(existingCallLog)) {
    const callLog = await persistWebhookCallLog({
      payload,
      lead,
      clientId,
      rawPayloadPatch: attentionPatch,
    });

    return {
      lead,
      callLog,
      outcomeResult: {
        applied: false,
        lead,
        skipped: "already_applied",
      },
      skipped: "already_applied",
    };
  }

  const transaction = await db.sequelize.transaction();
  try {
    const leadUpdates = {};
    if (String(leadData.follow_up_date || "").trim()) {
      leadUpdates.follow_up_date = leadData.follow_up_date;
    }

    let updatedLead =
      Object.keys(leadUpdates).length > 0
        ? await lead.update(leadUpdates, { transaction })
        : lead;

    const resultCode = manualFollowUpActive
      ? "call_received_outcome_pending"
      : "same_number_outcome_pending";

    const callLog = await persistWebhookCallLog({
      payload,
      lead: updatedLead,
      clientId,
      transaction,
      callId: `${payload?.call_id || lead?.call_id || `lead-${lead?.id}`}-repeat-${Date.now()}`,
      rawPayloadPatch: {
        ...attentionPatch,
        mode: manualFollowUpActive
          ? "MANUAL_FOLLOW_UP_ACTIVE"
          : "NORMAL_LEAD_ACTIVE",
      },
    });

    await transaction.commit();

    return {
      lead: updatedLead,
      callLog,
      outcomeResult: {
        applied: false,
        lead: updatedLead,
        skipped: "same_number_attention_pending",
      },
      skipped: "same_number_attention_pending",
      resultCode,
      normal_lead_attention_state: NORMAL_LEAD_ATTENTION_STATE,
      normal_lead_attention_label: NORMAL_LEAD_ATTENTION_LABEL,
      needs_manual_day_outcome: true,
    };
  } catch (err) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    throw err;
  }
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
      `[PixelEye] Failed to create/update pending compliance from webhook for call_id=${lead?.call_id || "-"}`,
    );
  }

  return compliance;
};

const markMatchingFollowUpComplianceCalled = async (callLog) => {
  try {
    if (
      !callLog?.client_id ||
      !callLog?.normalized_phone_number ||
      !callLog?.call_date
    ) {
      return null;
    }

    const pendingRows = await findPendingComplianceForCallLog(callLog);
    if (!Array.isArray(pendingRows) || pendingRows.length === 0) {
      return null;
    }

    const callStartedAt = callLog?.call_started_at
      ? new Date(callLog.call_started_at)
      : null;
    const validCallStartedAt =
      callStartedAt && !Number.isNaN(callStartedAt.getTime())
        ? callStartedAt
        : null;

    const selectedRow = pendingRows.slice().sort((a, b) => {
      if (validCallStartedAt) {
        const aScheduled = a?.scheduled_follow_up_at
          ? new Date(a.scheduled_follow_up_at)
          : null;
        const bScheduled = b?.scheduled_follow_up_at
          ? new Date(b.scheduled_follow_up_at)
          : null;
        const aDiff =
          aScheduled && !Number.isNaN(aScheduled.getTime())
            ? Math.abs(aScheduled.getTime() - validCallStartedAt.getTime())
            : Number.POSITIVE_INFINITY;
        const bDiff =
          bScheduled && !Number.isNaN(bScheduled.getTime())
            ? Math.abs(bScheduled.getTime() - validCallStartedAt.getTime())
            : Number.POSITIVE_INFINITY;

        if (aDiff !== bDiff) return aDiff - bDiff;
      }

      const aScheduled = a?.scheduled_follow_up_at
        ? new Date(a.scheduled_follow_up_at)
        : null;
      const bScheduled = b?.scheduled_follow_up_at
        ? new Date(b.scheduled_follow_up_at)
        : null;
      const aTime =
        aScheduled && !Number.isNaN(aScheduled.getTime())
          ? aScheduled.getTime()
          : Number.POSITIVE_INFINITY;
      const bTime =
        bScheduled && !Number.isNaN(bScheduled.getTime())
          ? bScheduled.getTime()
          : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    })[0];

    if (!selectedRow?.id) {
      return null;
    }

    const updated = await markComplianceAsCalled({
      compliance_id: selectedRow.id,
      callLog,
      reason: "Call found from Runo webhook",
      source: "RUNO_WEBHOOK",
    });

    if (!updated) {
      console.error(
        `[PixelEye] Failed to mark compliance as called for call_id=${callLog?.call_id || "—"}`,
      );
    }

    return updated;
  } catch (err) {
    console.error(
      `[PixelEye] markMatchingFollowUpComplianceCalled failed for call_id=${callLog?.call_id || "—"}:`,
      err?.message,
    );
    return null;
  }
};

export const processPixelEyeWebhook = async (payload) => {
  const normalizedCallId = getNormalizedServiceCallId(payload);
  const normalizedPayload =
    normalizedCallId && payload?.call_id !== normalizedCallId
      ? { ...payload, call_id: normalizedCallId }
      : payload;

  if (!normalizedPayload?.call_id) {
    throw createWebhookError("Missing required field: call_id/callId", 400);
  }

  const clientId = await resolveWebhookClientId(normalizedPayload);
  if (!clientId) {
    throw createWebhookError(
      "Unable to determine client context for webhook payload",
      400,
    );
  }

  const leadData = buildPixelEyeLeadData(normalizedPayload);
  const normalizedPhoneNumber = normalizePixelEyePhoneNumber(
    normalizedPayload?.phone_number ||
      normalizedPayload?.customer_phone ||
      normalizedPayload?.customerPhone ||
      normalizedPayload?.customer?.phoneNumber,
  );

  if (normalizedPayload?.phone_number && !normalizedPhoneNumber) {
    throw createWebhookError("Invalid phone number", 400);
  }

  let transaction = null;
  try {
    const existingCallLog = await findExistingWebhookCallLog(
      clientId,
      normalizedPayload.call_id,
    );

    const exactCallLead = await db.PixelEye.findOne({
      where: {
        client_id: clientId,
        call_id: normalizedPayload.call_id,
      },
    });

    if (exactCallLead) {
      const isExactCallActive = await isPixelEyeLeadActive(exactCallLead);

      if (isExactCallActive) {
        const oldFollowUpDate = exactCallLead.follow_up_date;
        const activeLeadResult = await runWebhookActiveLeadUpdate({
          lead: exactCallLead,
          clientId,
          payload: normalizedPayload,
          leadData,
          existingCallLog,
        });

        const updatedLead = activeLeadResult.lead;

        if (activeLeadResult.callLog) {
          await markMatchingFollowUpComplianceCalled(activeLeadResult.callLog);
        }

        if (
          activeLeadResult.skipped ||
          !activeLeadResult.outcomeResult?.applied
        ) {
          return {
            action: "updated",
            lead: updatedLead,
            resultCode:
              activeLeadResult.resultCode || activeLeadResult.skipped || null,
            normal_lead_attention_state:
              activeLeadResult.normal_lead_attention_state || null,
            normal_lead_attention_label:
              activeLeadResult.normal_lead_attention_label || null,
            needs_manual_day_outcome: Boolean(
              activeLeadResult.needs_manual_day_outcome,
            ),
          };
        }

        const normalizedOldFollowUpDate = String(oldFollowUpDate || "").trim();
        const normalizedNewFollowUpDate = String(
          updatedLead.follow_up_date ?? leadData.follow_up_date ?? "",
        ).trim();
        const followUpDateChanged =
          normalizedOldFollowUpDate !== normalizedNewFollowUpDate;

        if (
          await scheduleWebhookManualFollowUpIfEligible(
            updatedLead,
            leadData.follow_up_date,
          )
        ) {
          if (followUpDateChanged) {
            await persistPendingFollowUpCompliance({
              lead: updatedLead,
              followUpDate: leadData.follow_up_date,
              source: "RUNO_WEBHOOK",
              reason: "Pending follow-up call check from Runo webhook",
            });

            await createWebhookFollowUpHistoryEntry({
              lead: updatedLead,
              oldFollowUpDate,
              newFollowUpDate:
                updatedLead.follow_up_date ?? leadData.follow_up_date,
              reason: "Follow-up date updated from Runo webhook",
            });
          } else {
            console.log(
              `[PixelEye] Skipped follow-up compliance refresh for call_id=${updatedLead?.call_id || "—"} because follow_up_date did not change`,
            );
          }

          return {
            action: "updated",
            lead: updatedLead,
            resultCode:
              activeLeadResult.resultCode || activeLeadResult.skipped || null,
          };
        }
        return {
          action: "updated",
          lead: updatedLead,
          resultCode:
            activeLeadResult.resultCode || activeLeadResult.skipped || null,
        };
      }

      const callLog = await persistWebhookCallLog({
        payload: normalizedPayload,
        lead: exactCallLead,
        clientId,
      });
      if (callLog) {
        await markMatchingFollowUpComplianceCalled(callLog);
      }

      console.log(
        `[PixelEye] Ignored webhook lead mutation for closed same-call payload call_id=${exactCallLead.call_id}`,
      );

      return {
        action: "same_call_noop",
        lead: exactCallLead,
        resultCode: "same_call_noop",
      };
    }

    // Decision logic for same-phone lead lifecycle:
    // Search existing PixelEye leads by client_id + normalized_phone_number.
    const existingLead = normalizedPhoneNumber
      ? await findPixelEyeLeadByPhone(clientId, normalizedPhoneNumber)
      : null;

    if (existingLead && (await isPixelEyeLeadActive(existingLead))) {
      const oldFollowUpDate = existingLead.follow_up_date;
      const activeLeadResult = await runWebhookActiveLeadUpdate({
        lead: existingLead,
        clientId,
        payload: normalizedPayload,
        leadData,
        existingCallLog,
      });

      const updatedLead = activeLeadResult.lead;

      if (activeLeadResult.callLog) {
        await markMatchingFollowUpComplianceCalled(activeLeadResult.callLog);
      }

      if (
        activeLeadResult.skipped ||
        !activeLeadResult.outcomeResult?.applied
      ) {
        return {
          action: "updated",
          lead: updatedLead,
          resultCode:
            activeLeadResult.resultCode || activeLeadResult.skipped || null,
          normal_lead_attention_state:
            activeLeadResult.normal_lead_attention_state || null,
          normal_lead_attention_label:
            activeLeadResult.normal_lead_attention_label || null,
          needs_manual_day_outcome: Boolean(
            activeLeadResult.needs_manual_day_outcome,
          ),
        };
      }

      const outcomeAppliedLead = updatedLead;

      const normalizedOldFollowUpDate = String(oldFollowUpDate || "").trim();
      const normalizedNewFollowUpDate = String(
        outcomeAppliedLead.follow_up_date ?? leadData.follow_up_date ?? "",
      ).trim();
      const followUpDateChanged =
        normalizedOldFollowUpDate !== normalizedNewFollowUpDate;

      if (
        await scheduleWebhookManualFollowUpIfEligible(
          outcomeAppliedLead,
          leadData.follow_up_date,
        )
      ) {
        if (followUpDateChanged) {
          await persistPendingFollowUpCompliance({
            lead: outcomeAppliedLead,
            followUpDate: leadData.follow_up_date,
            source: "RUNO_WEBHOOK",
            reason: "Pending follow-up call check from Runo webhook",
          });

          await createWebhookFollowUpHistoryEntry({
            lead: outcomeAppliedLead,
            oldFollowUpDate,
            newFollowUpDate:
              outcomeAppliedLead.follow_up_date ?? leadData.follow_up_date,
            reason: "Follow-up date updated from Runo webhook",
          });
        } else {
          console.log(
            `[PixelEye] Skipped follow-up compliance refresh for call_id=${updatedLead?.call_id || "—"} because follow_up_date did not change`,
          );
        }

        return {
          action: "updated",
          lead: outcomeAppliedLead,
          resultCode:
            activeLeadResult.resultCode || activeLeadResult.skipped || null,
          normal_lead_attention_state:
            activeLeadResult.normal_lead_attention_state || null,
          normal_lead_attention_label:
            activeLeadResult.normal_lead_attention_label || null,
          needs_manual_day_outcome: Boolean(
            activeLeadResult.needs_manual_day_outcome,
          ),
        };
      }
      return {
        action: "updated",
        lead: outcomeAppliedLead,
        resultCode:
          activeLeadResult.resultCode || activeLeadResult.skipped || null,
        normal_lead_attention_state:
          activeLeadResult.normal_lead_attention_state || null,
        normal_lead_attention_label:
          activeLeadResult.normal_lead_attention_label || null,
        needs_manual_day_outcome: Boolean(
          activeLeadResult.needs_manual_day_outcome,
        ),
      };
    }

    transaction = await db.sequelize.transaction();
    const createdLead = await db.PixelEye.create(
      {
        ...leadData,
        client_id: clientId,
        phone_number: leadData.normalized_phone_number,
        normalized_phone_number: leadData.normalized_phone_number,
      },
      { transaction },
    );

    await transaction.commit();

    const callLog = await persistWebhookCallLog({
      payload: normalizedPayload,
      lead: createdLead,
      clientId,
    });
    if (callLog) {
      await markMatchingFollowUpComplianceCalled(callLog);
    }

    if (
      await scheduleWebhookManualFollowUpIfEligible(
        createdLead,
        leadData.follow_up_date,
      )
    ) {
      await persistPendingFollowUpCompliance({
        lead: createdLead,
        followUpDate: leadData.follow_up_date,
        source: "RUNO_WEBHOOK",
        reason: "Pending follow-up call check from Runo webhook",
      });

      await createWebhookFollowUpHistoryEntry({
        lead: createdLead,
        oldFollowUpDate: null,
        newFollowUpDate: createdLead.follow_up_date ?? leadData.follow_up_date,
        reason: "Follow-up date received from Runo webhook",
      });

      return {
        action: "created",
        lead: createdLead,
        resultCode: "created",
      };
    }

    // Process after commit and surface reminder-state failures to the webhook caller.
    await processLeadStatus(createdLead, clientId, "webhook-create");
    return {
      action: "created",
      lead: createdLead,
      resultCode: "created",
    };
  } catch (err) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    if (err?.name === "SequelizeValidationError") {
      throw createWebhookError(err.message, 400);
    }
    throw err;
  }
};
