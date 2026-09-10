import crypto from "crypto";
import db from "../../../database/index.js";
import { normalizePhone } from "../../birthwave/birthwaveWebsiteLead.service.js";
import { logBirthwaveActivity } from "../../birthwave/birthwaveActivity.service.js";
import { verifyRepliSignature } from "./verifyRepliWebhook.js";
import { normalizeRepliBirthwaveLead } from "./normalizeRepliBirthwaveLead.js";
import {
  REPLI_PROVIDER as PROVIDER,
  resolveRepliBirthwaveClient,
  upsertBirthwaveRepliLead,
  hasSufficientRepliIdentity,
} from "./repliBirthwaveShared.service.js";

// Actual Repli outgoing-webhook event names (Repli Developers UI):
//   lead.created · lead.completed · appointment.created · message.sent · test.ping
// Only these two are lead events for this integration.
export const REPLI_BIRTHWAVE_LEAD_EVENTS = new Set([
  "lead.created",
  "lead.completed",
]);
export const REPLI_PING_EVENT = "test.ping";

const LEAD_ACTIVITY_TITLE = {
  "lead.created": "Instagram lead received from Repli.",
  "lead.completed": "Instagram lead details completed in Repli.",
};

const isEnabled = () =>
  String(process.env.REPLI_BIRTHWAVE_WEBHOOK_ENABLED || "").toLowerCase() ===
  "true";

const isDebug = () =>
  String(process.env.REPLI_BIRTHWAVE_WEBHOOK_DEBUG || "").toLowerCase() ===
  "true";

const firstHeader = (value) => (Array.isArray(value) ? value[0] : value);

const rawToString = (rawBody) =>
  Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody ?? "");

const isUniqueViolation = (err) =>
  err?.name === "SequelizeUniqueConstraintError" ||
  err?.original?.code === "ER_DUP_ENTRY" ||
  err?.parent?.code === "ER_DUP_ENTRY";

/**
 * Resolve the Repli event name. `X-Repli-Event` header is authoritative; the
 * body value is only a fallback and, when it disagrees, a stage-only warning.
 */
const resolveEvent = (headers, body) => {
  const headerEvent = String(firstHeader(headers["x-repli-event"]) || "").trim();
  const bodyEvent = String(
    body?.event || body?.type || body?.event_type || body?.eventType || "",
  ).trim();

  const event = headerEvent || bodyEvent;

  if (
    headerEvent &&
    bodyEvent &&
    headerEvent !== bodyEvent &&
    isDebug()
  ) {
    console.warn(
      `[Repli][Birthwave][debug] event mismatch — header="${headerEvent}" body="${bodyEvent}"; using header`,
    );
  }

  return event || null;
};

/**
 * Webhook delivery id — distinct from the Repli lead id. Prefer the
 * `X-Repli-Delivery` header; else a stable body field; else a hash of the raw
 * body so identical retries still dedupe. The root `id` is deliberately NOT
 * used here (it may be an event/message/conversation id).
 */
const resolveDeliveryId = (headers, body, rawBody) => {
  const raw =
    firstHeader(headers["x-repli-delivery"]) ||
    body?.delivery_id ||
    body?.deliveryId ||
    body?.event_id ||
    body?.eventId;
  const text = raw ? String(raw).trim() : "";
  if (text) return text.slice(0, 191);
  return `sha256:${crypto
    .createHash("sha256")
    .update(rawToString(rawBody))
    .digest("hex")}`;
};

/**
 * Upsert the audit row for this delivery. UNIQUE(provider, delivery_id) is the
 * idempotency anchor; a prior FAILED row is allowed to transition.
 */
const recordWebhookEvent = async ({
  deliveryId,
  eventType,
  clientId,
  status,
  payload,
  errorMessage = null,
  transaction = null,
}) => {
  const now = new Date();
  const values = {
    provider: PROVIDER,
    client_id: clientId ?? null,
    event_type: eventType || null,
    delivery_id: deliveryId,
    status,
    payload,
    error_message: errorMessage ? String(errorMessage).slice(0, 1000) : null,
    received_at: now,
    processed_at: ["PROCESSED", "IGNORED"].includes(status) ? now : null,
  };

  const [row, created] = await db.IntegrationWebhookEvent.findOrCreate({
    where: { provider: PROVIDER, delivery_id: deliveryId },
    defaults: values,
    transaction,
  });
  if (!created) await row.update(values, { transaction });
  return row;
};

const priorDelivery = (deliveryId) =>
  db.IntegrationWebhookEvent.findOne({
    where: { provider: PROVIDER, delivery_id: deliveryId },
  });

/**
 * @returns {{ status: number, payload: object }}
 */
export const processRepliBirthwaveWebhook = async ({ rawBody, headers = {} }) => {
  if (!isEnabled()) {
    return {
      status: 503,
      payload: { success: false, message: "Repli Birthwave webhook is disabled" },
    };
  }

  const hasSignatureHeader = Boolean(firstHeader(headers["x-repli-signature"]));
  const verification = verifyRepliSignature(
    rawBody,
    headers,
    process.env.REPLI_BIRTHWAVE_WEBHOOK_SECRET,
  );
  if (!verification.ok) {
    console.warn(`[Repli][Birthwave] signature rejected: ${verification.reason}`);
    return { status: 401, payload: { success: false, message: "Unauthorized" } };
  }

  let body;
  try {
    body = JSON.parse(rawToString(rawBody));
  } catch {
    return {
      status: 400,
      payload: { success: false, message: "Invalid JSON body" },
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      status: 400,
      payload: { success: false, message: "Invalid payload" },
    };
  }

  const event = resolveEvent(headers, body);
  const deliveryId = resolveDeliveryId(headers, body, rawBody);
  const eventLabel = event || "(none)";

  if (isDebug()) {
    console.log(
      `[Repli][Birthwave][debug] event=${eventLabel} delivery=${deliveryId} ` +
        `sigHeaderPresent=${hasSignatureHeader} sigFormat=${verification.signatureFormat} ` +
        `bodyKeys=${JSON.stringify(Object.keys(body))}`,
    );
    console.log("[Repli][Birthwave][debug] body", JSON.stringify(body));
  }

  try {
    // ── test.ping — connectivity/security check only ────────────────────────
    if (event === REPLI_PING_EVENT) {
      const prior = await priorDelivery(deliveryId);
      if (!prior) {
        await recordWebhookEvent({
          deliveryId,
          eventType: event,
          clientId: null,
          status: "IGNORED",
          payload: body,
          errorMessage: "Connectivity test (test.ping)",
        });
      }
      return { status: 200, payload: { success: true, pong: true } };
    }

    // ── Not a lead event (appointment.created, message.sent, unknown, none) ─
    if (!event || !REPLI_BIRTHWAVE_LEAD_EVENTS.has(event)) {
      const prior = await priorDelivery(deliveryId);
      if (!prior || !["PROCESSED", "IGNORED"].includes(prior.status)) {
        await recordWebhookEvent({
          deliveryId,
          eventType: event,
          clientId: null,
          status: "IGNORED",
          payload: body,
          errorMessage: event
            ? `Unsupported event: ${event}`
            : "Missing event name",
        });
      }
      return { status: 200, payload: { success: true, ignored: true } };
    }

    // ── lead.created / lead.completed ──────────────────────────────────────

    // Delivery-level dedupe (distinct from CRM lead dedupe below).
    const existing = await priorDelivery(deliveryId);
    if (existing && ["PROCESSED", "IGNORED"].includes(existing.status)) {
      return { status: 200, payload: { success: true, duplicate: true } };
    }

    // Birthwave client is resolved internally — never from the payload.
    const client = await resolveRepliBirthwaveClient();
    if (!client) {
      await recordWebhookEvent({
        deliveryId,
        eventType: event,
        clientId: null,
        status: "FAILED",
        payload: body,
        errorMessage: `Birthwave client not found for client_key=${process.env.REPLI_BIRTHWAVE_CLIENT_KEY || "birthwave"}`,
      });
      return {
        status: 500,
        payload: { success: false, message: "Client resolution failed" },
      };
    }

    const normalized = normalizeRepliBirthwaveLead(body);
    const phone = normalized.phone ? normalizePhone(normalized.phone) : null;

    if (isDebug()) {
      console.log("[Repli][Birthwave][debug] normalized", {
        name: normalized.name,
        phone: normalized.phone,
        normalizedPhone: phone,
        email: normalized.email,
        externalLeadId: normalized.externalLeadId,
        rootId: normalized.rootId,
        campaign: normalized.campaign,
        leadScore: normalized.leadScore,
        conversationId: normalized.conversationId,
        answerKeys: Object.keys(normalized.answers || {}),
      });
    }

    const validPhone =
      phone && phone.replace(/\D/g, "").length >= 7 ? phone : null;

    // birthwave_leads.phone is nullable — a stable Repli external id is
    // sufficient identity on its own (the /leads API confirms a valid,
    // completed lead can carry no phone). Only "no phone AND no external id"
    // is unusable. A permanently unusable payload is IGNORED (not FAILED)
    // since we still answer 200 — a 5xx would make Repli retry it forever.
    if (!hasSufficientRepliIdentity(normalized, validPhone)) {
      await recordWebhookEvent({
        deliveryId,
        eventType: event,
        clientId: client.id,
        status: "IGNORED",
        payload: body,
        errorMessage: "Missing required phone number",
      });
      return {
        status: 200,
        payload: { success: true, processed: false, reason: "missing_phone" },
      };
    }

    const result = await db.sequelize.transaction(async (transaction) => {
      // Both lead.created and lead.completed may create — Repli can deliver
      // lead.completed even if lead.created never reached us. Same shared
      // dedupe/upsert the historical /leads API sync uses.
      const { action, lead } = await upsertBirthwaveRepliLead({
        client,
        normalized,
        phone: validPhone,
        transaction,
      });

      await recordWebhookEvent({
        deliveryId,
        eventType: event,
        clientId: client.id,
        status: "PROCESSED",
        payload: body,
        transaction,
      });

      return { action, leadId: lead.id, clientId: client.id };
    });

    // Timeline entry is best-effort (logBirthwaveActivity never throws). It runs
    // only after delivery dedupe + a committed transaction, so a retried
    // delivery does not double-log.
    await logBirthwaveActivity({
      clientId: result.clientId,
      leadId: result.leadId,
      eventType: "lead_source_activity",
      title: LEAD_ACTIVITY_TITLE[event] || "Instagram lead received from Repli.",
      description: [
        normalized.campaign ? `Campaign: ${normalized.campaign}` : null,
        `Delivery: ${deliveryId}`,
      ]
        .filter(Boolean)
        .join(" · "),
    });

    return {
      status: 200,
      payload: { success: true, processed: true, action: result.action },
    };
  } catch (err) {
    // Concurrent same-delivery race: the UNIQUE(provider, delivery_id) index is
    // the source of truth — treat the loser as a duplicate, not a 500.
    if (isUniqueViolation(err)) {
      console.warn(
        `[Repli][Birthwave] concurrent delivery=${deliveryId} — treated as duplicate`,
      );
      return {
        status: 200,
        payload:
          event === REPLI_PING_EVENT
            ? { success: true, pong: true }
            : { success: true, duplicate: true },
      };
    }

    console.error(
      `[Repli][Birthwave] processing failed delivery=${deliveryId}: ${err?.message}`,
    );
    try {
      await recordWebhookEvent({
        deliveryId,
        eventType: event,
        clientId: null,
        status: "FAILED",
        payload: body,
        errorMessage: err?.message || "processing error",
      });
    } catch (auditErr) {
      if (!isUniqueViolation(auditErr)) {
        console.error(
          `[Repli][Birthwave] failed to write audit row: ${auditErr?.message}`,
        );
      }
    }
    return {
      status: 500,
      payload: { success: false, message: "Processing failed" },
    };
  }
};

export default processRepliBirthwaveWebhook;
