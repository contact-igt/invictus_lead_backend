// Website Direct-to-CRM regression guard: every legitimate website enquiry
// IS a CRM Lead on arrival — no manual "Promote" step. Covers routing,
// assignment, INITIAL_CALL Primary Task creation, idempotency, Contact
// reuse/conflict, the no-matching-rule path, and Google Sheet independence.
// See BIRTHWAVE_WEBSITE_DIRECT_LEAD_REFACTOR_REPORT.md, BW-FIX (website
// direct lead).
import assert from "node:assert/strict";
import db from "../database/index.js";
import { createWebsiteLead } from "../modules/birthwave/birthwaveWebsiteLead.service.js";
import { createTeam, addTeamMember } from "../modules/birthwave/birthwaveTeam.service.js";
import { createAssignmentRule } from "../modules/birthwave/birthwaveAssignment.service.js";

if (!["local", "development"].includes(process.env.INVICTUS_SERVER_LINE || "local")) {
  throw new Error("Website direct-lead verification is restricted to local/development databases");
}

const clientRow = await db.Client.findOne({ order: [["id", "ASC"]], attributes: ["id"] });
assert.ok(clientRow, "At least one local client is required");
const clientId = clientRow.id;
const tenant = { id: clientId };
const actor = { id: null, role: "super-admin" };
const suffix = Date.now();

const websiteIds = [];
const leadIds = [];
const teamIds = [];
const ruleIds = [];
const managementIds = [];
const contactIds = [];

const phoneFor = (n) => `+9198${String(suffix).slice(-7)}${String(n).padStart(2, "0")}`;

const createTelecaller = async (label) => {
  const row = await db.Management.create({
    client_id: clientId, title: "Mr", username: `wdl-${label}-${suffix}`,
    email: `wdl-${label}-${suffix}@example.test`, mobile: `92${String(suffix).slice(-8)}`.slice(-10),
    password: "verification-only", role: "client",
  });
  managementIds.push(row.id);
  return row;
};

try {
  // ── Setup: a routable team + an eligible telecaller + a matching rule ──
  const team = await createTeam(tenant, { name: `WDL Team ${suffix}`, code: `wdl_${suffix}` }, actor);
  teamIds.push(team.id);
  const caller = await createTelecaller("caller");
  await addTeamMember(tenant, team.id, { management_id: caller.id, operational_role: "TELECALLER" }, actor);
  const service = `wdl-service-${suffix}`;
  const rule = await createAssignmentRule(tenant, { name: `WDL Rule ${suffix}`, priority: 1, service, source: "website", team_id: team.id, assignment_method: "ROUND_ROBIN" }, actor);
  ruleIds.push(rule.id);

  // ── 1. Website form -> Contact -> Lead, routed + assigned + INITIAL_CALL task, in one call ──
  const submissionId = `wdl-submission-${suffix}`;
  const intake = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac",
    external_submission_id: submissionId,
    name: "WDL Direct Lead",
    phone: phoneFor(1),
    email: `wdl-${suffix}@example.test`,
    service,
    consent: true,
    attribution: { source: "website", channel: "Form" },
  }, { skipSheetSync: true });
  websiteIds.push(intake.id);
  leadIds.push(intake.birthwave_lead_id);
  assert.equal(intake.duplicate, false);
  assert.ok(Number.isInteger(intake.birthwave_lead_id), "A CRM Lead must be created directly, with no promotion step");

  const leadRow = await db.BirthwaveLead.findByPk(intake.birthwave_lead_id);
  assert.equal(leadRow.source, "website");
  assert.equal(leadRow.contact_id !== null, true, "Lead must be linked to a resolved Contact");
  contactIds.push(leadRow.contact_id);

  const websiteRow = await db.BirthwaveWebsiteLead.findByPk(intake.id);
  assert.equal(websiteRow.birthwave_lead_id, intake.birthwave_lead_id, "Website row must be linked back to its Lead");
  assert.equal(websiteRow.status, "Contacted");

  // ── Routing / Assignment / Primary Task (a matching rule exists) ──
  assert.equal(leadRow.current_team_id, team.id, "A matching routing rule must assign the Team");
  assert.ok(leadRow.current_owner_id, "A matching ROUND_ROBIN rule must assign an Owner");
  const primaryTasks = await db.BirthwaveTask.findAll({ where: { client_id: clientId, lead_id: leadRow.id, is_primary: true, status: { [db.Sequelize.Op.in]: ["PENDING", "IN_PROGRESS", "OVERDUE"] } } });
  assert.equal(primaryTasks.length, 1, "Exactly one active Primary Task must exist for a routed Lead");
  assert.equal(primaryTasks[0].task_type, "INITIAL_CALL");

  // ── 2. Duplicate submission -> exactly one Lead, no new task/assignment ──
  const beforeTaskCount = await db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: leadRow.id } });
  const duplicate = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac", external_submission_id: submissionId,
    name: "WDL Direct Lead", phone: phoneFor(1), email: `wdl-${suffix}@example.test`, service,
  }, { skipSheetSync: true });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.id, intake.id);
  assert.equal(duplicate.birthwave_lead_id, intake.birthwave_lead_id, "Retried submission must not create a second CRM Lead");
  const afterTaskCount = await db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: leadRow.id } });
  assert.equal(afterTaskCount, beforeTaskCount, "Duplicate submission must not create a second Primary Task");

  // ── 3. Same phone, different submission -> Contact reused, NEW Lead created ──
  const secondSubmissionId = `wdl-submission-2-${suffix}`;
  const secondIntake = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac", external_submission_id: secondSubmissionId,
    name: "WDL Returning Enquiry", phone: phoneFor(1), email: `wdl-${suffix}@example.test`, service,
  }, { skipSheetSync: true });
  websiteIds.push(secondIntake.id);
  leadIds.push(secondIntake.birthwave_lead_id);
  assert.notEqual(secondIntake.birthwave_lead_id, intake.birthwave_lead_id, "A second, distinct enquiry must create a new Lead");
  const secondLeadRow = await db.BirthwaveLead.findByPk(secondIntake.birthwave_lead_id);
  assert.equal(secondLeadRow.contact_id, leadRow.contact_id, "Same phone must resolve to the same Contact across separate enquiries");

  // ── 4. Contact conflict (phone -> Contact A, email -> Contact B) -> 409, no partial Lead ──
  const conflictPhone = phoneFor(2);
  const conflictEmail = `wdl-conflict-${suffix}@example.test`;
  const seedForConflict = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac", external_submission_id: `wdl-conflict-seed-${suffix}`,
    name: "WDL Conflict Seed", phone: conflictPhone, service,
  }, { skipSheetSync: true });
  websiteIds.push(seedForConflict.id);
  leadIds.push(seedForConflict.birthwave_lead_id);
  const seedForConflict2 = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac", external_submission_id: `wdl-conflict-seed-2-${suffix}`,
    name: "WDL Conflict Seed 2", phone: phoneFor(3), email: conflictEmail, service,
  }, { skipSheetSync: true });
  websiteIds.push(seedForConflict2.id);
  leadIds.push(seedForConflict2.birthwave_lead_id);

  const websiteCountBefore = await db.BirthwaveWebsiteLead.count({ where: { client_id: clientId } });
  const leadCountBefore = await db.BirthwaveLead.count({ where: { client_id: clientId } });
  await assert.rejects(
    () => createWebsiteLead(clientId, {
      source_key: "birthwave_vbac", external_submission_id: `wdl-conflict-attempt-${suffix}`,
      name: "WDL Conflict Attempt", phone: conflictPhone, email: conflictEmail, service,
    }, { skipSheetSync: true }),
    (error) => error.status === 409 && error.code === "CONTACT_IDENTITY_CONFLICT",
    "A phone/email identity conflict must be rejected, not silently merged",
  );
  assert.equal(await db.BirthwaveWebsiteLead.count({ where: { client_id: clientId } }), websiteCountBefore, "A rejected conflict must not leave a partial website-lead row");
  assert.equal(await db.BirthwaveLead.count({ where: { client_id: clientId } }), leadCountBefore, "A rejected conflict must not leave a partial CRM Lead");

  // ── 5. No matching rule -> Lead stays NEW / unassigned, no task ──
  const unroutedIntake = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac", external_submission_id: `wdl-unrouted-${suffix}`,
    name: "WDL Unrouted", phone: phoneFor(4), service: `wdl-no-rule-service-${suffix}`,
  }, { skipSheetSync: true });
  websiteIds.push(unroutedIntake.id);
  leadIds.push(unroutedIntake.birthwave_lead_id);
  const unroutedLead = await db.BirthwaveLead.findByPk(unroutedIntake.birthwave_lead_id);
  assert.equal(unroutedLead.status, "NEW");
  assert.equal(unroutedLead.current_team_id, null);
  assert.equal(unroutedLead.current_owner_id, null);
  const unroutedTasks = await db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: unroutedLead.id } });
  assert.equal(unroutedTasks, 0, "A Lead with no matching routing rule must have no Primary Task, not an incorrect one");

  // ── 6. Google Sheet failure must not roll back or block the CRM Lead ──
  const badEnvKey = "BIRTHWAVE_SHEET_URL_BIRTHWAVE_VBAC";
  const previousSheetUrl = process.env[badEnvKey];
  process.env[badEnvKey] = "http://127.0.0.1:1/unreachable";
  try {
    const sheetTestIntake = await createWebsiteLead(clientId, {
      source_key: "birthwave_vbac", external_submission_id: `wdl-sheetfail-${suffix}`,
      name: "WDL Sheet Failure", phone: phoneFor(5), service,
    }); // skipSheetSync intentionally omitted — exercise the real (failing) path
    websiteIds.push(sheetTestIntake.id);
    leadIds.push(sheetTestIntake.birthwave_lead_id);
    assert.ok(Number.isInteger(sheetTestIntake.birthwave_lead_id), "CRM Lead creation must succeed even though the Sheet webhook is unreachable");
    // The Sheet call is fire-and-forget; give it a moment to fail and persist.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const sheetRow = await db.BirthwaveWebsiteLead.findByPk(sheetTestIntake.id);
    assert.ok(["failed", "syncing", "pending"].includes(sheetRow.sheet_sync_status), "Sheet failure must be recorded on the staging row, not raised to the caller");
    const stillThere = await db.BirthwaveLead.findByPk(sheetTestIntake.birthwave_lead_id);
    assert.ok(stillThere, "The CRM Lead must remain committed regardless of Sheet sync outcome");
  } finally {
    if (previousSheetUrl === undefined) delete process.env[badEnvKey];
    else process.env[badEnvKey] = previousSheetUrl;
  }

  console.log(JSON.stringify({
    passed: true,
    checks: [
      "direct-creation-no-promotion-step",
      "routing-assignment-primary-task",
      "duplicate-submission-single-lead",
      "same-phone-reuses-contact-new-lead",
      "contact-conflict-409-no-partial-lead",
      "no-matching-rule-stays-new-unassigned",
      "sheet-failure-does-not-block-or-rollback-lead",
    ],
  }, null, 2));
} finally {
  if (leadIds.length) {
    await db.BirthwaveTask.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveLeadAssignment.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: leadIds } });
  }
  if (websiteIds.length) await db.BirthwaveWebsiteLead.destroy({ where: { client_id: clientId, id: websiteIds } });
  if (ruleIds.length) await db.BirthwaveAssignmentRule.destroy({ where: { client_id: clientId, id: ruleIds } });
  if (teamIds.length) {
    await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: teamIds } });
    await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: teamIds } });
    await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: teamIds } });
  }
  if (managementIds.length) await db.Management.destroy({ where: { id: managementIds } });
  if (contactIds.length) await db.BirthwaveContact.destroy({ where: { id: [...new Set(contactIds)] } });
  await db.sequelize.close();
}
