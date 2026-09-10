/**
 * Repli `/leads` API record → the flat shape `normalizeRepliBirthwaveLead`
 * already understands, so the historical sync reuses the shared normalizer
 * unchanged instead of duplicating field mapping.
 *
 * Confirmed real response record shape:
 *   { id, platform, status, instagram_username, telegram_username,
 *     collected_data: { "<question label>": "<answer>", ... },
 *     created_at, completed_at }
 *
 * IMPORTANT: only THIS adapter treats a root-level `id` as the Repli lead id
 * — confirmed for the `/leads` API specifically. The webhook normalizer is
 * intentionally untouched and still never assumes that for webhook payloads.
 *
 * `collected_data` holds free-form questionnaire answers keyed by the
 * question text Repli asked (not a fixed field name), so name/email/phone are
 * recovered with tolerant label matching rather than exact keys.
 */

const NAME_LABEL_HINTS = ["name"];
const EMAIL_LABEL_HINTS = ["email"];
const PHONE_LABEL_HINTS = ["phone", "mobile", "whatsapp", "contact number"];
// birthwave_leads.service already exists as a generic free-text field (used
// by manual and website-form leads alike) — map into it the same tolerant
// way as name/email/phone, rather than hardcoding one exact question string.
const SERVICE_LABEL_HINTS = ["service", "interested in", "looking for"];

const normalizeLabel = (label) => String(label ?? "").toLowerCase().trim();

/**
 * First `collected_data` answer whose question label contains one of `hints`.
 * Case-insensitive substring match — Repli's exact question wording is not
 * fixed ("What is your name?", "Full Name", "Your name", …).
 */
const findAnswerByHints = (collectedData, hints) => {
  if (!collectedData || typeof collectedData !== "object") return null;
  for (const [label, value] of Object.entries(collectedData)) {
    const normalizedLabel = normalizeLabel(label);
    if (hints.some((hint) => normalizedLabel.includes(hint))) {
      const text = value === undefined || value === null ? "" : String(value).trim();
      if (text) return text;
    }
  }
  return null;
};

export const adaptRepliApiLeadRecord = (record = {}) => {
  const collectedData =
    record?.collected_data && typeof record.collected_data === "object"
      ? record.collected_data
      : {};

  const extractedName = findAnswerByHints(collectedData, NAME_LABEL_HINTS);
  const extractedEmail = findAnswerByHints(collectedData, EMAIL_LABEL_HINTS);
  const extractedPhone = findAnswerByHints(collectedData, PHONE_LABEL_HINTS);
  const extractedService = findAnswerByHints(collectedData, SERVICE_LABEL_HINTS);

  return {
    // Explicit key the shared normalizer already resolves as the lead id —
    // no change needed to normalizeRepliBirthwaveLead's id-resolution logic.
    lead_id: record?.id != null ? String(record.id) : null,

    // Name fallback order: extracted answer → instagram_username → (the
    // shared upsert's own "Instagram Lead" placeholder on create).
    name: extractedName || record?.instagram_username || null,
    email: extractedEmail || null,
    phone: extractedPhone || null,
    service: extractedService || null,

    status: record?.status ?? null,
    // Reuses the normalizer's existing `answers` extraction/merge.
    answers: collectedData,
  };
};

export default adaptRepliApiLeadRecord;
