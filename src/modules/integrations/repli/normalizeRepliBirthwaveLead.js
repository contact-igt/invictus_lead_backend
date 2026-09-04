/**
 * Repli `lead.created` / `lead.completed` → normalized Birthwave lead shape.
 *
 * Repli's exact payload keys are confirmed via the Repli test webhook before
 * go-live; this reader is deliberately tolerant of the common casings/nesting
 * (`data`/`lead`/`payload` envelopes, camelCase + snake_case) so a minor key
 * change does not drop a lead. Everything unmapped is preserved under
 * `rawMetadata` for debugging.
 *
 * IMPORTANT: a root-level `id` is NOT treated as the Repli lead id (it may be
 * an event/message/conversation id). It is kept only as `rootId` for metadata
 * until a real Repli delivery confirms its meaning.
 */

const firstDefined = (obj, keys) => {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
};

const str = (value, max = 255) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
};

const num = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

// Both the confirmed `/leads` API shape and the confirmed live webhook shape
// (`lead.completed` payload observed 2026-09-04) carry a free-form
// `collected_data` questionnaire — keyed by whatever question text Repli
// asked ("What is your name?", "what is your phone number?", ...), not by a
// fixed field name. Recover name/email/phone/service the same
// case-insensitive-substring way regardless of which path the lead arrived
// through.
const NAME_LABEL_HINTS = ["name"];
const EMAIL_LABEL_HINTS = ["email"];
const PHONE_LABEL_HINTS = ["phone", "mobile", "whatsapp", "contact number"];
const SERVICE_LABEL_HINTS = ["service", "interested in", "looking for", "type of care", "care do you need"];

const normalizeLabel = (label) => String(label ?? "").toLowerCase().trim();

const findAnswerByHints = (collectedData, hints) => {
  if (!collectedData || typeof collectedData !== "object") return undefined;
  for (const [label, value] of Object.entries(collectedData)) {
    const normalizedLabel = normalizeLabel(label);
    if (hints.some((hint) => normalizedLabel.includes(hint))) {
      const text = value === undefined || value === null ? "" : String(value).trim();
      if (text) return text;
    }
  }
  return undefined;
};

export const normalizeRepliBirthwaveLead = (body = {}) => {
  const root = asObject(body);
  // Repli commonly wraps the lead under one of these envelopes.
  const envelopes = [
    asObject(root.payload),
    asObject(root.data),
    asObject(root.lead),
    asObject(asObject(root.payload).lead),
    asObject(asObject(root.data).lead),
  ];
  // `lead` merges root + envelopes for generic fields; `nestedLead` excludes
  // root so a nested lead object's own `id` can be trusted as the lead id.
  const lead = Object.assign({}, root, ...envelopes);
  const nestedLead = Object.assign({}, ...envelopes);

  const contact = {
    ...lead,
    ...asObject(lead.contact),
    ...asObject(lead.customer),
    ...asObject(lead.from),
  };

  const collectedData = asObject(lead.collected_data);

  const answers = {
    ...asObject(lead.answers),
    ...asObject(lead.questionnaire),
    ...asObject(lead.responses),
    ...asObject(lead.custom_fields),
    ...collectedData,
  };

  const instagramUsername = str(
    firstDefined(lead, ["instagram_username", "instagramUsername"]),
    191,
  );

  const normalized = {
    name:
      str(
        firstDefined(contact, ["name", "full_name", "fullName", "username"]) ??
          findAnswerByHints(collectedData, NAME_LABEL_HINTS),
      ) || instagramUsername || null,
    phone:
      str(
        firstDefined(contact, [
          "phone",
          "phone_number",
          "phoneNumber",
          "mobile",
          "whatsapp",
          "wa_id",
        ]) ?? findAnswerByHints(collectedData, PHONE_LABEL_HINTS),
        40,
      ) || null,
    email:
      str(
        firstDefined(contact, ["email", "email_address", "emailAddress"]) ??
          findAnswerByHints(collectedData, EMAIL_LABEL_HINTS),
        200,
      ) || null,
    service:
      str(
        firstDefined(contact, ["service", "service_interest", "interested_service"]) ??
          findAnswerByHints(collectedData, SERVICE_LABEL_HINTS),
        255,
      ) || null,

    source: "instagram",
    originalSource: "INSTAGRAM",

    campaign:
      str(
        firstDefined(lead, [
          "campaign",
          "campaign_name",
          "campaignName",
          "ad_campaign",
        ]),
        191,
      ) || null,
    leadScore: num(
      firstDefined(lead, ["lead_score", "leadScore", "score", "rating"]),
    ),

    // Explicit lead-id keys anywhere, else a nested lead object's own `id`.
    // Never the root-level `id`.
    externalLeadId:
      str(
        firstDefined(lead, [
          "lead_id",
          "leadId",
          "external_lead_id",
          "externalLeadId",
        ]) ?? firstDefined(nestedLead, ["id"]),
        191,
      ) || null,
    rootId: str(root.id, 191) || null,
    conversationId:
      str(
        firstDefined(lead, [
          "conversation_id",
          "conversationId",
          "thread_id",
          "threadId",
        ]),
        191,
      ) || null,
    workspaceId:
      str(
        firstDefined(lead, ["workspace_id", "workspaceId", "account_id"]),
        191,
      ) || null,
    agentId:
      str(firstDefined(lead, ["agent_id", "agentId", "assistant_id"]), 191) ||
      null,

    // Repli's /leads API describes records as carrying a "completion state"
    // (has the questionnaire finished). Kept as opaque metadata only — no
    // business logic depends on its exact values until confirmed.
    completionState:
      firstDefined(lead, [
        "completion_state",
        "completionState",
        "completed",
        "is_completed",
        // Repli's /leads API confirms a bare `status` (e.g. "completed").
        "status",
      ]) ?? null,

    answers: asObject(answers),
    rawMetadata: root,

    // Present on both confirmed shapes (root-level on the /leads API record,
    // under `data` on the live webhook payload — already unwrapped by the
    // envelope merge above). Generic pass-through metadata, no business
    // logic depends on these.
    instagramUsername,
    telegramUsername: str(firstDefined(lead, ["telegram_username", "telegramUsername"]), 191),
    platform: str(firstDefined(lead, ["platform"]), 60),
    repliCreatedAt: str(firstDefined(lead, ["created_at", "createdAt"]), 60),
    repliCompletedAt: str(firstDefined(lead, ["completed_at", "completedAt"]), 60),
  };

  return normalized;
};

export default normalizeRepliBirthwaveLead;
