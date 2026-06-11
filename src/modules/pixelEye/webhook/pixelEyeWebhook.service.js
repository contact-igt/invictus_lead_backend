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
  createOrUpdatePendingFollowUpCompliance,
  findPendingComplianceForCallLog,
  markComplianceAsCalled,
} from "../pixelEyeFollowUpCallCompliance.service.js";

const RUNO_SERVICE_NAME = "Runo";
const DEFAULT_WEBHOOK_CLIENT_KEY = "pixeleye";

const createWebhookError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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
  return {
    date: payload.date,
    time: payload.time,
    call_id: payload.call_id,
    customer_name: payload.customer_name,
    phone_number: payload.phone_number,
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
    logWebhookFollowUpSkip(lead?.call_id, "follow_up_date must be in the future");
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

const persistWebhookCallLog = async ({ payload, lead, clientId }) => {
  const callLog = await createPixelEyeCallLog({
    client_id: clientId,
    lead_id: lead?.id ?? null,
    call_id: payload?.call_id,
    phone_number: payload?.phone_number,
    customer_name: payload?.customer_name,
    agent_name: payload?.assigned_to || payload?.agent_name || null,
    date: payload?.date,
    time: payload?.time,
    status: payload?.status,
    source: "RUNO_WEBHOOK",
    raw_payload: payload,
    direction: payload?.direction || payload?.call_direction || null,
    duration_seconds:
      payload?.duration_seconds ?? payload?.duration ?? payload?.call_duration ?? null,
    recording_url:
      payload?.recording_url || payload?.call_recording || payload?.recording || null,
    disposition: payload?.disposition || payload?.status || null,
  });

  if (!callLog) {
    console.error(
      `[PixelEye] Failed to persist call log for call_id=${payload?.call_id || "—"}`,
    );
  }

  return callLog;
};

const persistPendingFollowUpCompliance = async ({ lead, followUpDate, source, reason }) => {
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
      `[PixelEye] Failed to create/update pending compliance from webhook for call_id=${lead?.call_id || "â€”"}`,
    );
  }

  return compliance;
};

const markMatchingFollowUpComplianceCalled = async (callLog) => {
  try {
    if (!callLog?.client_id || !callLog?.normalized_phone_number || !callLog?.call_date) {
      return null;
    }

    const pendingRows = await findPendingComplianceForCallLog(callLog);
    if (!Array.isArray(pendingRows) || pendingRows.length === 0) {
      return null;
    }

    const callStartedAt = callLog?.call_started_at ? new Date(callLog.call_started_at) : null;
    const validCallStartedAt = callStartedAt && !Number.isNaN(callStartedAt.getTime())
      ? callStartedAt
      : null;

    const selectedRow = pendingRows
      .slice()
      .sort((a, b) => {
        if (validCallStartedAt) {
          const aScheduled = a?.scheduled_follow_up_at ? new Date(a.scheduled_follow_up_at) : null;
          const bScheduled = b?.scheduled_follow_up_at ? new Date(b.scheduled_follow_up_at) : null;
          const aDiff = aScheduled && !Number.isNaN(aScheduled.getTime())
            ? Math.abs(aScheduled.getTime() - validCallStartedAt.getTime())
            : Number.POSITIVE_INFINITY;
          const bDiff = bScheduled && !Number.isNaN(bScheduled.getTime())
            ? Math.abs(bScheduled.getTime() - validCallStartedAt.getTime())
            : Number.POSITIVE_INFINITY;

          if (aDiff !== bDiff) return aDiff - bDiff;
        }

        const aScheduled = a?.scheduled_follow_up_at ? new Date(a.scheduled_follow_up_at) : null;
        const bScheduled = b?.scheduled_follow_up_at ? new Date(b.scheduled_follow_up_at) : null;
        const aTime = aScheduled && !Number.isNaN(aScheduled.getTime()) ? aScheduled.getTime() : Number.POSITIVE_INFINITY;
        const bTime = bScheduled && !Number.isNaN(bScheduled.getTime()) ? bScheduled.getTime() : Number.POSITIVE_INFINITY;
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
  if (!payload?.call_id) {
    throw createWebhookError("Missing required field: call_id", 400);
  }

  const clientId = await resolveWebhookClientId(payload);
  if (!clientId) {
    throw createWebhookError(
      "Unable to determine client context for webhook payload",
      400,
    );
  }

  const leadData = buildPixelEyeLeadData(payload);

  const transaction = await db.sequelize.transaction();
  try {
    // Deduplicate by phone number: same number for the same client → update status only
    const existingLead = payload.phone_number
      ? await db.PixelEye.findOne({
          where: {
            client_id: clientId,
            phone_number: payload.phone_number,
          },
          transaction,
        })
      : null;

    if (existingLead) {
      const oldFollowUpDate = existingLead.follow_up_date;
      const updatedLead = await existingLead.update(
        {
          status: leadData.status,
          follow_up_date: leadData.follow_up_date,
        },
        { transaction },
      );
      await transaction.commit();

      const callLog = await persistWebhookCallLog({
        payload,
        lead: updatedLead,
        clientId,
      });
      if (callLog) {
        await markMatchingFollowUpComplianceCalled(callLog);
      }

      const normalizedOldFollowUpDate = String(oldFollowUpDate || "").trim();
      const normalizedNewFollowUpDate = String(updatedLead.follow_up_date ?? leadData.follow_up_date ?? "").trim();
      const followUpDateChanged = normalizedOldFollowUpDate !== normalizedNewFollowUpDate;

      if (await scheduleWebhookManualFollowUpIfEligible(updatedLead, leadData.follow_up_date)) {
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
            newFollowUpDate: updatedLead.follow_up_date ?? leadData.follow_up_date,
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
        };
      }

      // Notify after commit so the DB state is consistent.
      processLeadStatus(updatedLead, clientId, "webhook-update").catch((err) =>
        console.error(`[PixelEye] processLeadStatus(webhook-update) failed for call_id=${updatedLead?.call_id}:`, err?.message),
      );
      return {
        action: "updated",
        lead: updatedLead,
      };
    }

    const createdLead = await db.PixelEye.create(
      {
        ...leadData,
        client_id: clientId,
      },
      { transaction },
    );

    await transaction.commit();

    const callLog = await persistWebhookCallLog({
      payload,
      lead: createdLead,
      clientId,
    });
    if (callLog) {
      await markMatchingFollowUpComplianceCalled(callLog);
    }

    if (await scheduleWebhookManualFollowUpIfEligible(createdLead, leadData.follow_up_date)) {
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
      };
    }

    // Notify after commit so the DB state is consistent.
    processLeadStatus(createdLead, clientId, "webhook-create").catch((err) =>
      console.error(`[PixelEye] processLeadStatus(webhook-create) failed for call_id=${createdLead?.call_id}:`, err?.message),
    );
    return {
      action: "created",
      lead: createdLead,
    };
  } catch (err) {
    await transaction.rollback();
    if (err?.name === "SequelizeValidationError") {
      throw createWebhookError(err.message, 400);
    }
    throw err;
  }
};
