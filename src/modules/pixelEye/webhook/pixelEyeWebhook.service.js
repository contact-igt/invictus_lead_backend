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
      const updatedLead = await existingLead.update(
        {
          status: leadData.status,
          follow_up_date: leadData.follow_up_date,
        },
        { transaction },
      );
      await transaction.commit();

      if (await scheduleWebhookManualFollowUpIfEligible(updatedLead, leadData.follow_up_date)) {
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

    if (await scheduleWebhookManualFollowUpIfEligible(createdLead, leadData.follow_up_date)) {
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
