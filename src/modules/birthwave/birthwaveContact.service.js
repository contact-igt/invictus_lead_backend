import { Op } from "sequelize";
import db from "../../database/index.js";

const httpError = (status, message, code = null, details = undefined) => {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
};

export const normalizeBirthwavePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return digits ? `+${digits}` : null;
};

export const normalizeBirthwaveEmail = (email) => {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
};

const normalizeName = (name) =>
  typeof name === "string" ? name.trim().slice(0, 150) : "";

const transactionOptions = (transaction) => (transaction ? { transaction } : {});

const identityWhere = (clientId, field, value) => ({
  client_id: clientId,
  status: { [Op.ne]: "merged" },
  [field]: value,
});

const serializeContact = (row) =>
  row
    ? {
        id: row.id,
        client_id: row.client_id,
        display_name: row.display_name,
        normalized_phone: row.normalized_phone,
        normalized_email: row.normalized_email,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    : null;

/**
 * Resolve a CRM identity inside one tenant. Phone has precedence over email;
 * conflicting matches are surfaced and never merged automatically.
 */
export const resolveOrCreateBirthwaveContact = async ({
  clientId,
  name,
  phone,
  email,
  transaction,
  allowUnidentified = false,
}) => {
  if (!clientId) throw httpError(403, "A valid client context is required");

  const normalizedPhone = normalizeBirthwavePhone(phone);
  const normalizedEmail = normalizeBirthwaveEmail(email);
  if (!normalizedPhone && !normalizedEmail) {
    if (allowUnidentified) return { contact: null, created: false, matchMethod: "unresolved" };
    throw httpError(400, "A phone number or email is required to resolve a Contact");
  }

  const options = transactionOptions(transaction);
  const [phoneMatch, emailMatch] = await Promise.all([
    normalizedPhone
      ? db.BirthwaveContact.findOne({
          where: identityWhere(clientId, "normalized_phone", normalizedPhone),
          ...options,
          ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
        })
      : null,
    normalizedEmail
      ? db.BirthwaveContact.findOne({
          where: identityWhere(clientId, "normalized_email", normalizedEmail),
          ...options,
          ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
        })
      : null,
  ]);

  if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) {
    throw httpError(
      409,
      "Phone and email resolve to different Contacts; review is required",
      "CONTACT_IDENTITY_CONFLICT",
      { phone_contact_id: phoneMatch.id, email_contact_id: emailMatch.id },
    );
  }

  const existing = phoneMatch || emailMatch;
  if (existing) {
    const patch = {};
    const displayName = normalizeName(name);
    if (displayName && (!existing.display_name || existing.display_name === "Unknown Contact")) {
      patch.display_name = displayName;
    }
    if (!existing.normalized_phone && normalizedPhone) patch.normalized_phone = normalizedPhone;
    if (!existing.normalized_email && normalizedEmail) patch.normalized_email = normalizedEmail;
    if (Object.keys(patch).length) await existing.update(patch, options);
    return { contact: serializeContact(existing), created: false, matchMethod: phoneMatch ? "phone" : "email" };
  }

  try {
    const created = await db.BirthwaveContact.create(
      {
        client_id: clientId,
        display_name: normalizeName(name) || "Unknown Contact",
        normalized_phone: normalizedPhone,
        normalized_email: normalizedEmail,
        status: "active",
      },
      options,
    );
    return { contact: serializeContact(created), created: true, matchMethod: "created" };
  } catch (error) {
    // A unique identity race is retried as a normal resolution. The caller's
    // transaction remains the authority for all linked Lead writes.
    if (error?.name !== "SequelizeUniqueConstraintError") throw error;
    const retry = await resolveOrCreateBirthwaveContact({
      clientId,
      name,
      phone,
      email,
      transaction,
      allowUnidentified,
    });
    return retry;
  }
};

export const serializeBirthwaveContact = serializeContact;
