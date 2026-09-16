import db from "../../../database/index.js";
import { normalizeClientKey } from "../../../utils/clientKey.js";
import { resolveOrCreateBirthwaveContact } from "../../birthwave/birthwaveContact.service.js";
import {
  resolveServiceForIntake,
  getSystemFallbackService,
} from "../../birthwave/birthwaveService.service.js";

/**
 * BW-SVC-001: maps Repli's free-text service onto this tenant's service master.
 *
 * Never guesses. An exact name or slug match wins; anything else falls back to
 * the protected "Not sure yet" service, which is the documented behaviour for an
 * enquiry whose service is not yet established. Returns how it matched so the
 * caller can record that on the Lead's integration metadata.
 */
const resolveRepliService = async (clientId, text, transaction) => {
  const { service, matchedBy } = await resolveServiceForIntake({ clientId, text, transaction });
  if (service) return { service, matchedBy };
  const fallback = await getSystemFallbackService(clientId, transaction);
  return { service: fallback, matchedBy: fallback ? "fallback" : null };
};

/**
 * Shared between the live Repli webhook and the historical `/leads` API sync
 * so both paths resolve the Birthwave client and dedupe/enrich leads
 * identically. Neither caller should reimplement this logic.
 */

export const REPLI_PROVIDER = "REPLI";
export const REPLI_LEAD_PLACEHOLDER_NAME = "Instagram Lead";

/**
 * Birthwave client is always resolved server-side from
 * REPLI_BIRTHWAVE_CLIENT_KEY — never trusted from a webhook payload or a
 * request parameter.
 */
export const resolveRepliBirthwaveClient = async () => {
  const clientKey = normalizeClientKey(
    process.env.REPLI_BIRTHWAVE_CLIENT_KEY || "birthwave",
  );
  return db.Client.findOne({ where: { client_key: clientKey } });
};

export const buildRepliIntegrationMetadata = (n, extra = {}) => ({
  provider: REPLI_PROVIDER,
  channel: "INSTAGRAM",
  campaign: n.campaign,
  score: n.leadScore,
  external_lead_id: n.externalLeadId,
  root_id: n.rootId ?? null,
  conversation_id: n.conversationId,
  workspace_id: n.workspaceId,
  agent_id: n.agentId,
  answers: n.answers || {},
  collected_data: n.answers || {},
  response_details: n.rawMetadata || {},
  completion_state: n.completionState ?? null,
  instagram_username: n.instagramUsername ?? null,
  telegram_username: n.telegramUsername ?? null,
  platform: n.platform ?? null,
  repli_status: n.completionState ?? null,
  repli_created_at: n.repliCreatedAt ?? null,
  repli_completed_at: n.repliCompletedAt ?? null,
  last_event_at: new Date().toISOString(),
  // `extra` (per-call metadataExtra, e.g. sync's sync_source/sync_type/synced_at)
  // always wins on overlapping keys — it's the more specific caller.
  ...extra,
});

export const mergeRepliIntegrationMetadata = (prev, next) => {
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const merged = { ...(isObject(prev) ? prev : {}) };
  for (const [key, value] of Object.entries(next || {})) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    merged[key] = isObject(value)
      ? mergeRepliIntegrationMetadata(merged[key], value)
      : value;
  }
  return merged;
};

/**
 * A Repli lead is only storable/matchable when it carries a stable identity:
 * either the confirmed Repli lead id (source_external_id), or a usable phone.
 * A confirmed `/leads` API record CAN have no phone collected (Repli's
 * questionnaire may finish without asking for one) — that alone is not a
 * reason to drop it, since source_external_id is sufficient identity on its
 * own. Only "no external id AND no phone" is insufficient.
 */
export const hasSufficientRepliIdentity = (normalized, phone) =>
  Boolean(normalized?.externalLeadId) || Boolean(phone);

/**
 * Create-or-enrich a `birthwave_leads` row for a normalized Repli lead.
 * Used by both the webhook (`lead.created`/`lead.completed`) and the
 * historical `/leads` API sync — this is the single CRM lead-dedupe +
 * upsert implementation for Repli → Birthwave.
 *
 * Dedupe priority, always scoped to the given Birthwave `client` (never
 * cross-client, never a bare `where:{phone}`):
 *   1. client_id + source_provider="REPLI" + source_external_id
 *   2. else, only if `phone` is provided: client_id + phone
 *
 * `phone` may be null (birthwave_leads.phone is nullable) — a
 * source_external_id-only lead is a valid Birthwave lead. If a later call
 * (webhook or sync) supplies a phone for an existing phone-less lead, it is
 * filled in as an enrichment; an existing phone is never overwritten.
 *
 * CRM-managed fields (status, assigned user, notes, follow-up/appointment
 * status, manual custom fields) are never written or overwritten here.
 *
 * @returns {Promise<{ action: "created"|"updated", lead: object }>}
 */
export const upsertBirthwaveRepliLead = async ({
  client,
  normalized,
  phone = null,
  transaction,
  metadataExtra = {},
}) => {
  let lead = null;

  if (normalized.externalLeadId) {
    lead = await db.BirthwaveLead.findOne({
      where: {
        client_id: client.id,
        source_provider: REPLI_PROVIDER,
        source_external_id: normalized.externalLeadId,
      },
      transaction,
    });
  }
  // Phone fallback match only applies when a phone is actually known — never
  // match on a null/absent phone (that would collide every phone-less lead).
  if (!lead && phone) {
    lead = await db.BirthwaveLead.findOne({
      where: { client_id: client.id, phone },
      order: [["created_at", "DESC"]],
      transaction,
    });
  }

  const nextMeta = buildRepliIntegrationMetadata(normalized, metadataExtra);
  const resolvedContact = await resolveOrCreateBirthwaveContact({
    clientId: client.id,
    name: normalized.name || REPLI_LEAD_PLACEHOLDER_NAME,
    phone,
    email: normalized.email,
    transaction,
    allowUnidentified: true,
  });
  let action;

  // BW-SVC-001: Repli sends arbitrary external text, which must never be stored
  // as a canonical service. It is matched against this tenant's service master by
  // name/slug; an unrecognised value is NOT guessed — it falls back to the
  // protected "Not sure yet" service so the Lead still routes and a telecaller
  // establishes the real service on the first call. The provider's original
  // string is preserved in integration_metadata either way.
  const repliService = await resolveRepliService(client.id, normalized.service, transaction);
  if (normalized.service) {
    nextMeta.provider_service_text = normalized.service;
    nextMeta.service_match = repliService.matchedBy || "unmatched";
  }

  if (!lead) {
    lead = await db.BirthwaveLead.create(
      {
        client_id: client.id,
        contact_id: resolvedContact.contact?.id ?? null,
        name: normalized.name || REPLI_LEAD_PLACEHOLDER_NAME,
        phone: phone || null,
        email: normalized.email,
        service_id: repliService.service?.id ?? null,
        service: repliService.service?.name ?? normalized.service ?? null,
        source: "instagram",
        status: "new_lead",
        source_provider: REPLI_PROVIDER,
        source_external_id: normalized.externalLeadId,
        custom_fields: {},
        integration_metadata: nextMeta,
      },
      { transaction },
    );
    action = "created";
  } else {
    // Enrich only — never touch CRM-managed fields (status, assigned user,
    // notes, follow-up/appointment status, manual custom fields).
    const patch = {
      integration_metadata: mergeRepliIntegrationMetadata(
        lead.integration_metadata,
        nextMeta,
      ),
    };
    if (resolvedContact.contact && !lead.contact_id) patch.contact_id = resolvedContact.contact.id;
    if (
      normalized.name &&
      (!lead.name || lead.name === REPLI_LEAD_PLACEHOLDER_NAME)
    ) {
      patch.name = normalized.name;
    }
    if (normalized.email && !lead.email) patch.email = normalized.email;
    // Enrichment only fills a service that is still missing — never overwrites a
    // service a telecaller has already established on the CRM side.
    if (repliService.service && !lead.service_id) {
      patch.service_id = repliService.service.id;
      patch.service = repliService.service.name;
    } else if (normalized.service && !lead.service) {
      patch.service = normalized.service;
    }
    // Fill a previously-missing phone (e.g. Repli's API returned no phone,
    // then a later webhook event supplied one). Never overwrite an existing one.
    if (phone && !lead.phone) patch.phone = phone;
    if (!lead.source_provider) patch.source_provider = REPLI_PROVIDER;
    if (!lead.source_external_id && normalized.externalLeadId) {
      patch.source_external_id = normalized.externalLeadId;
    }
    await lead.update(patch, { transaction });
    action = "updated";
  }

  return { action, lead };
};
