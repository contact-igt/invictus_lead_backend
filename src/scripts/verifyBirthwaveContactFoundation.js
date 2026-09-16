import assert from "node:assert/strict";
import db from "../database/index.js";
import { createWebsiteLead, promoteWebsiteLead } from "../modules/birthwave/birthwaveWebsiteLead.service.js";
import { resolveOrCreateBirthwaveContact } from "../modules/birthwave/birthwaveContact.service.js";

const serverLine = process.env.INVICTUS_SERVER_LINE || "local";
if (!['local', 'development'].includes(serverLine)) {
  throw new Error("Contact foundation verification is restricted to local/development databases");
}

const clientRows = await db.Client.findAll({ order: [["id", "ASC"]], limit: 2, attributes: ["id"] });
assert.equal(clientRows.length >= 2, true, "At least two local clients are required for tenant isolation verification");
const clientId = clientRows[0].id;
const otherClientId = clientRows[1].id;
const suffix = Date.now();
const phone = `+919000${String(suffix).slice(-6)}`;
const email = `birthwave-phase2-${suffix}@example.test`;
const websiteIds = [];
const leadIds = [];
const contactIds = [];

try {
  const first = await resolveOrCreateBirthwaveContact({ clientId, name: "Phase Two Contact", phone, email });
  contactIds.push(first.contact.id);
  assert.equal(first.created, true);

  const samePhone = await resolveOrCreateBirthwaveContact({ clientId, name: "Different Display Name", phone });
  assert.equal(samePhone.contact.id, first.contact.id, "Phone resolution must reuse the tenant Contact");

  const otherTenant = await resolveOrCreateBirthwaveContact({ clientId: otherClientId, name: "Other Tenant", phone });
  contactIds.push(otherTenant.contact.id);
  assert.notEqual(otherTenant.contact.id, first.contact.id, "Contact identity must be tenant scoped");

  const conflictEmail = `conflict-${suffix}@example.test`;
  const emailContact = await resolveOrCreateBirthwaveContact({ clientId, name: "Email Contact", email: conflictEmail });
  contactIds.push(emailContact.contact.id);
  await assert.rejects(
    () => resolveOrCreateBirthwaveContact({ clientId, name: "Conflict", phone, email: conflictEmail }),
    (error) => error.code === "CONTACT_IDENTITY_CONFLICT" && error.status === 409,
  );

  // Website Direct-to-CRM: createWebsiteLead() now creates the operational
  // birthwave_leads row itself — there is no separate "promote" step for a
  // new submission. See BIRTHWAVE_WEBSITE_DIRECT_LEAD_REFACTOR_REPORT.md.
  const intake = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac",
    external_submission_id: `submission-${suffix}`,
    name: "Website Phase Two",
    phone,
    email,
    service: "VBAC",
  }, { skipSheetSync: true });
  websiteIds.push(intake.id);
  assert.equal(intake.duplicate, false);
  assert.ok(Number.isInteger(intake.birthwave_lead_id), "createWebsiteLead must create the CRM Lead directly");
  leadIds.push(intake.birthwave_lead_id);

  const duplicate = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac",
    external_submission_id: `submission-${suffix}`,
    name: "Website Phase Two",
    phone,
    email,
  }, { skipSheetSync: true });
  assert.equal(duplicate.id, intake.id, "Duplicate website submission must return the original row");
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.birthwave_lead_id, intake.birthwave_lead_id, "Duplicate submission must not create a second CRM Lead");

  // The legacy promotion endpoint must remain safe/idempotent for a Lead
  // that already exists (it's now a no-op reporting the existing link).
  const promoted = await promoteWebsiteLead(clientId, intake.id, { id: null, name: "Verification" });
  assert.equal(promoted.created, false, "promoteWebsiteLead must not create a second Lead for an already-linked website enquiry");
  assert.equal(promoted.birthwave_lead_id, intake.birthwave_lead_id);
  const concurrent = await Promise.all([
    promoteWebsiteLead(clientId, intake.id, { id: null, name: "Verification" }),
    promoteWebsiteLead(clientId, intake.id, { id: null, name: "Verification" }),
  ]);
  assert.equal(concurrent[0].birthwave_lead_id, promoted.birthwave_lead_id);
  assert.equal(concurrent[1].birthwave_lead_id, promoted.birthwave_lead_id);

  console.log(JSON.stringify({
    passed: true,
    checks: ["contact-create", "phone-reuse", "tenant-isolation", "identity-conflict", "website-idempotency", "promotion-atomic-link", "promotion-concurrency"],
  }, null, 2));
} finally {
  if (leadIds.length) await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: leadIds } });
  if (leadIds.length) await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: leadIds } });
  if (websiteIds.length) await db.BirthwaveWebsiteLead.destroy({ where: { client_id: clientId, id: websiteIds } });
  if (contactIds.length) {
    await db.BirthwaveContact.destroy({ where: { id: contactIds } });
  }
  await db.sequelize.close();
}
