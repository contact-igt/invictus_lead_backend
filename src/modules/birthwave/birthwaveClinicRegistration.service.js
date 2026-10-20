import db from "../../database/index.js";
import { normalizeClientKey } from "../../utils/clientKey.js";
import { resolveOrCreateBirthwaveContact } from "./birthwaveContact.service.js";
import { resolveServiceForIntake, getSystemFallbackService } from "./birthwaveService.service.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";
import { normalizePhone } from "./birthwaveWebsiteLead.service.js";

/**
 * Clinic check-in registrations (checkin.thebirthwave.in) -> birthwave_leads.
 *
 * One registration reference = one CRM lead. Dedupe is on
 * client_id + source_provider + source_external_id (the registration reference),
 * NEVER on phone: the same patient registering on another day is a new lead.
 */

export const CLINIC_PROVIDER = "CLINIC_REGISTRATION";
export const CLINIC_LEAD_SOURCE = "clinic_registration";

const CONCERN_LABELS = {
  pregnancy: "Pregnancy",
  fertility: "Fertility",
  gynaecology: "Gynaecology",
  paediatrics: "Paediatrics",
  vbac: "VBAC",
  vaginismus: "Vaginismus",
  not_sure: "Not sure yet",
};

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolveClinicClient = async () => {
  const key = normalizeClientKey(
    process.env.BIRTHWAVE_CLINIC_CLIENT_KEY || process.env.REPLI_BIRTHWAVE_CLIENT_KEY || "birthwave",
  );
  const client = await db.Client.findOne({ where: { client_key: key } });
  if (!client) throw httpError(503, "Intake unavailable");
  return client;
};

const dateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// Patient details live in integration_metadata. Nothing here is written to the
// activity timeline or logs.
const buildMetadata = (payload) => {
  const { lead } = payload;
  const address = lead.address || {};
  return {
    provider: CLINIC_PROVIDER,
    channel: "CLINIC",
    category: lead.category || "Clinic registrations",
    last_event_at: new Date().toISOString(),
    clinic_registration: {
      reference: payload.reference,
      clinic_id: payload.clinicId || null,
      clinic_date: dateOnly(payload.clinicDate),
      registered_at: payload.registeredAt ? new Date(payload.registeredAt).toISOString() : null,
      date_of_birth: dateOnly(lead.dateOfBirth),
      gender: lead.gender || null,
      alternate_phone: lead.alternatePhone || null,
      address: {
        line1: address.line1 || null,
        line2: address.line2 || null,
        city: address.city || null,
        state: address.state || null,
        pin: address.pin || null,
      },
      concerns: lead.concerns || [],
      heard_about_us: lead.sources || [],
      heard_about_us_other: lead.sourceOther || null,
      guardian_review_required: Boolean(lead.guardianReviewRequired),
      consent: Boolean(lead.consent),
    },
  };
};

// Serialises concurrent deliveries of the same reference within this process.
const inFlight = new Map();
const withReferenceLock = async (key, fn) => {
  const prev = inFlight.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = prev.then(() => gate);
  inFlight.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (inFlight.get(key) === tail) inFlight.delete(key);
  }
};

/** @returns {Promise<{ created: boolean, leadId: number }>} */
export const ingestClinicRegistration = async (payload) => {
  const client = await resolveClinicClient();
  const { lead } = payload;
  const phone = normalizePhone(lead.phone);

  return withReferenceLock(`${client.id}:${payload.reference}`, async () => {
    const existing = await db.BirthwaveLead.findOne({
      where: {
        client_id: client.id,
        source_provider: CLINIC_PROVIDER,
        source_external_id: payload.reference,
      },
      attributes: ["id"],
    });
    if (existing) return { created: false, leadId: existing.id };

    const result = await db.sequelize.transaction(async (transaction) => {
      const contact = await resolveOrCreateBirthwaveContact({
        clientId: client.id,
        name: lead.name,
        phone,
        email: lead.email || null,
        transaction,
        allowUnidentified: true,
      });

      // Map the first stated concern onto the tenant's service master; never
      // guess - anything unmatched falls back to the protected "Not sure yet".
      const firstConcern = (lead.concerns || [])[0];
      const matched = firstConcern
        ? await resolveServiceForIntake({
            clientId: client.id,
            text: CONCERN_LABELS[firstConcern] || firstConcern,
            transaction,
          })
        : { service: null };
      const service = matched.service || (await getSystemFallbackService(client.id, transaction));

      const created = await db.BirthwaveLead.create(
        {
          client_id: client.id,
          contact_id: contact.contact?.id ?? null,
          name: lead.name,
          phone,
          email: lead.email || null,
          service_id: service?.id ?? null,
          service: service?.name ?? null,
          source: CLINIC_LEAD_SOURCE,
          status: "NEW",
          source_provider: CLINIC_PROVIDER,
          source_external_id: payload.reference,
          custom_fields: {},
          integration_metadata: buildMetadata(payload),
        },
        { transaction },
      );
      return created;
    });

    await logBirthwaveActivity({
      clientId: client.id,
      leadId: result.id,
      eventType: "lead_source_activity",
      title: "Clinic registration received.",
      description: `Reference: ${payload.reference}`,
    });

    return { created: true, leadId: result.id };
  });
};
