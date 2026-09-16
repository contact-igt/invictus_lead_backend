import assert from "node:assert/strict";
import { Op } from "sequelize";
import db from "../database/index.js";
import { createWebsiteLead, promoteWebsiteLead } from "../modules/birthwave/birthwaveWebsiteLead.service.js";
import { createLead } from "../modules/birthwave/birthwave.service.js";
import { createTeam, addTeamMember, updateTeamMember } from "../modules/birthwave/birthwaveTeam.service.js";
import { assignLead, assignLeadRoundRobin } from "../modules/birthwave/birthwaveAssignment.service.js";
import { startTask } from "../modules/birthwave/birthwaveTask.service.js";
import { createManualTask } from "../modules/birthwave/birthwaveTask.service.js";
import { recordTaskOutcome } from "../modules/birthwave/birthwaveOutcome.service.js";
import { updateAppointment } from "../modules/birthwave/birthwave.service.js";
import { getMyWork, getTeamWork } from "../modules/birthwave/birthwaveWork.service.js";
import { reconcileAttention, listAttention, updateAttention } from "../modules/birthwave/birthwaveAttention.service.js";
import { getOperationalDashboard } from "../modules/birthwave/birthwaveDashboard.service.js";
import { resolveOrCreateBirthwaveContact } from "../modules/birthwave/birthwaveContact.service.js";

if (!["local", "development"].includes(process.env.INVICTUS_SERVER_LINE || "local")) {
  throw new Error("Phase 8 UAT is restricted to local/development databases");
}

const clients = await db.Client.findAll({ order: [["id", "ASC"]], limit: 2, attributes: ["id"] });
assert.ok(clients.length >= 2, "At least two local clients are required for tenant isolation checks");
const clientId = clients[0].id;
const otherClientId = clients[1].id;
const tenant = { id: clientId };
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const adminActor = { id: 0, role: "client", username: `phase8-admin-${suffix}` };
const managementIds = [];
const teamIds = [];
const leadIds = [];
const websiteIds = [];
const contactIds = [];
const appointmentIds = [];
const checks = [];
const due = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();
const past = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
const mark = (name) => checks.push(name);
const actorFor = (row, role) => ({ id: row.id, role, username: row.username });

const createManagement = async (label, role = "client") => {
  const row = await db.Management.create({
    client_id: clientId,
    title: "Mx",
    username: `phase8-${label}-${suffix}`,
    email: `phase8-${label}-${suffix}@example.test`,
    mobile: `98${String(suffix).replace(/\D/g, "").slice(-8)}`,
    password: "phase8-local-only",
    role,
  });
  managementIds.push(row.id);
  return row;
};

const createFixtureLead = async (name, index, service = "Pregnancy", source = "website", phone = null) => {
  const result = await createLead(tenant, {
    name,
    phone: phone || `+919${String(suffix).replace(/\D/g, "").slice(-7)}${String(index).padStart(2, "0")}`,
    email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.test`,
    service,
    source,
    status: "NEW",
  }, adminActor);
  leadIds.push(result.id);
  if (result.contact_id) contactIds.push(result.contact_id);
  return result;
};

const assignmentTask = async (leadId, ownerId, teamId = primaryTeam.id, actor = adminActor) => {
  const result = await assignLead({ tenant, leadId, teamId, ownerId, actor });
  assert.ok(result.task?.id, "Assignment creates a Primary Next Action");
  return result;
};

let admin;
let manager;
let caller1;
let caller2;
let caller3;
let primaryTeam;
let secondaryTeam;
let members;
const assignedTaskIds = [];

try {
  admin = await createManagement("admin", "admin");
  manager = await createManagement("manager");
  caller1 = await createManagement("caller-one");
  caller2 = await createManagement("caller-two");
  caller3 = await createManagement("caller-three");
  const managerActor = actorFor(manager, "team_manager");
  const callerActors = [actorFor(caller1, "telecaller"), actorFor(caller2, "telecaller"), actorFor(caller3, "telecaller")];

  primaryTeam = await createTeam(tenant, { name: `Phase 8 UAT Team ${suffix}`, code: `phase8_${suffix}` }, adminActor);
  secondaryTeam = await createTeam(tenant, { name: `Phase 8 Restricted Team ${suffix}`, code: `phase8_restricted_${suffix}` }, adminActor);
  teamIds.push(primaryTeam.id, secondaryTeam.id);
  const managerMember = await addTeamMember(tenant, primaryTeam.id, { management_id: manager.id, operational_role: "TEAM_MANAGER" }, adminActor);
  const member1 = await addTeamMember(tenant, primaryTeam.id, { management_id: caller1.id, operational_role: "TELECALLER" }, adminActor);
  const member2 = await addTeamMember(tenant, primaryTeam.id, { management_id: caller2.id, operational_role: "TELECALLER" }, adminActor);
  const member3 = await addTeamMember(tenant, primaryTeam.id, { management_id: caller3.id, operational_role: "TELECALLER" }, adminActor);
  await addTeamMember(tenant, secondaryTeam.id, { management_id: caller3.id, operational_role: "TELECALLER" }, adminActor);
  members = { manager: managerMember, caller1: member1, caller2: member2, caller3: member3 };
  mark("uat-users-and-team-membership");

  const serviceMatrix = ["Pregnancy", "VBAC", "Fertility", "Vaginismus", "Newborn", "Pediatrics"];
  const sourceMatrix = ["website", "instagram", "other", "referral"];
  for (let i = 0; i < 14; i += 1) {
    await createFixtureLead(`Phase 8 Lead ${i + 1} ${suffix}`, i + 1, serviceMatrix[i % serviceMatrix.length], sourceMatrix[i % sourceMatrix.length]);
  }
  assert.equal(leadIds.length, 14);
  mark("14-seed-leads-created-for-30-lead-uat-dataset");

  const websitePayload = {
    source_key: "birthwave_pregnancycare",
    external_submission_id: `phase8-submission-${suffix}`,
    name: `Phase 8 Website ${suffix}`,
    phone: `+919${String(suffix).replace(/\D/g, "").slice(-7)}91`,
    email: `phase8-website-${suffix}@example.test`,
    service: "Pregnancy",
    consent: true,
    attribution: { source: "website", campaign: "phase8", channel: "Form" },
  };
  // Website Direct-to-CRM: createWebsiteLead() now creates the CRM Lead
  // itself; promoteWebsiteLead() is a no-op safety net for already-linked
  // rows. See BIRTHWAVE_WEBSITE_DIRECT_LEAD_REFACTOR_REPORT.md.
  const intake = await createWebsiteLead(clientId, websitePayload, { skipSheetSync: true });
  websiteIds.push(intake.id);
  assert.equal(intake.duplicate, false);
  assert.ok(Number.isInteger(intake.birthwave_lead_id), "createWebsiteLead must create the CRM Lead directly");
  leadIds.push(intake.birthwave_lead_id);
  const duplicateIntake = await createWebsiteLead(clientId, websitePayload, { skipSheetSync: true });
  assert.equal(duplicateIntake.duplicate, true);
  assert.equal(duplicateIntake.birthwave_lead_id, intake.birthwave_lead_id, "Duplicate submission must not create a second CRM Lead");
  const promoted = await promoteWebsiteLead(clientId, intake.id, adminActor);
  assert.equal(promoted.created, false, "promoteWebsiteLead must not create a second Lead for an already-linked website enquiry");
  assert.equal(promoted.birthwave_lead_id, intake.birthwave_lead_id);
  const promotedAgain = await promoteWebsiteLead(clientId, intake.id, adminActor);
  assert.equal(promotedAgain.created, false);
  mark("website-idempotency-and-direct-crm-creation");

  const sharedPhone = `+919${String(suffix).replace(/\D/g, "").slice(-7)}77`;
  const reusedA = await createFixtureLead(`Phase 8 Reuse A ${suffix}`, 80, "VBAC", "referral", sharedPhone);
  const reusedB = await createFixtureLead(`Phase 8 Reuse B ${suffix}`, 81, "Fertility", "instagram", sharedPhone);
  assert.ok(reusedA.contact_id && reusedA.contact_id === reusedB.contact_id);
  const conflictContactA = await resolveOrCreateBirthwaveContact({ clientId, name: "Conflict A", phone: `+919${String(suffix).replace(/\D/g, "").slice(-7)}61`, email: `conflict-a-${suffix}@example.test` });
  const conflictContactB = await resolveOrCreateBirthwaveContact({ clientId, name: "Conflict B", phone: `+919${String(suffix).replace(/\D/g, "").slice(-7)}62`, email: `conflict-b-${suffix}@example.test` });
  contactIds.push(conflictContactA.contact.id, conflictContactB.contact.id);
  await assert.rejects(
    () => resolveOrCreateBirthwaveContact({ clientId, name: "Conflict", phone: conflictContactA.contact.normalized_phone, email: conflictContactB.contact.normalized_email }),
    (error) => error.status === 409 && /CONFLICT|conflict/i.test(error.code || error.message),
  );
  mark("contact-reuse-and-conflict-review");

  const rrLeads = await Promise.all([7, 8, 9].map((index) => db.BirthwaveLead.findByPk(leadIds[index - 1])));
  const rrResults = [];
  for (const lead of rrLeads) rrResults.push(await assignLeadRoundRobin({ tenant, leadId: lead.id, teamId: primaryTeam.id, actor: adminActor, scopeKey: `phase8:${suffix}` }));
  assert.equal(new Set(rrResults.map((result) => result.assignment.owner_id)).size, 3, "Round robin reaches all three callers");
  assignedTaskIds.push(...rrResults.map((result) => result.task.id));
  await updateTeamMember(tenant, primaryTeam.id, members.caller2.id, { status: "ASSIGNMENT_PAUSED", assignment_enabled: false }, adminActor);
  const pausedLead = await createFixtureLead(`Phase 8 Paused Member ${suffix}`, 90, "Pregnancy", "website");
  const pausedResult = await assignLeadRoundRobin({ tenant, leadId: pausedLead.id, teamId: primaryTeam.id, actor: adminActor, scopeKey: `phase8-paused:${suffix}` });
  assert.notEqual(pausedResult.assignment.owner_id, caller2.id);
  await updateTeamMember(tenant, primaryTeam.id, members.caller2.id, { status: "ACTIVE", assignment_enabled: true }, adminActor);
  const reassigned = await assignLead({ tenant, leadId: rrLeads[0].id, teamId: primaryTeam.id, ownerId: caller3.id, actor: adminActor, reason: "Phase 8 reassignment" });
  assert.equal(reassigned.assignment.owner_id, caller3.id);
  mark("round-robin-paused-member-and-reassignment");

  const myWork = await getMyWork(tenant, { limit: 100 }, actorFor(caller3, "telecaller"));
  const sectionValues = (payload) => Object.values(payload.sections || {});
  assert.ok(myWork.sections && sectionValues(myWork).every((section) => section.tasks.every((row) => Number(row.owner.id) === caller3.id)));
  const caller1Work = await getMyWork(tenant, { limit: 100 }, actorFor(caller1, "telecaller"));
  assert.ok(sectionValues(caller1Work).every((section) => section.tasks.every((row) => Number(row.owner.id) === caller1.id)));
  const teamWork = await getTeamWork(tenant, { team_id: primaryTeam.id, limit: 100 }, managerActor);
  assert.ok(teamWork.sections && teamWork.summary);
  await assert.rejects(() => getTeamWork(tenant, { team_id: secondaryTeam.id }, managerActor), (error) => error.status === 403);
  mark("my-work-team-work-permissions-and-grouping");

  const outcomeLead = await createFixtureLead(`Phase 8 Outcome ${suffix}`, 100, "Pregnancy", "instagram");
  const outcomeAssignment = await assignmentTask(outcomeLead.id, caller1.id);
  const outcomeOwner = actorFor(caller1, "telecaller");
  await startTask(tenant, outcomeAssignment.task.id, outcomeOwner);
  const retry = await recordTaskOutcome(tenant, outcomeAssignment.task.id, { outcome_event_id: `phase8-no-answer-${suffix}`, contact_result: "NOT_REACHED", not_reached_reason: "NO_ANSWER", next_action_due_at: due(30) }, outcomeOwner);
  assert.equal(retry.next_task.task_type, "RETRY_CALL");
  const retryDuplicate = await Promise.all([
    recordTaskOutcome(tenant, outcomeAssignment.task.id, { outcome_event_id: `phase8-no-answer-${suffix}`, contact_result: "NOT_REACHED", not_reached_reason: "BUSY", next_action_due_at: due(40) }, outcomeOwner),
    recordTaskOutcome(tenant, outcomeAssignment.task.id, { outcome_event_id: `phase8-no-answer-${suffix}`, contact_result: "NOT_REACHED", not_reached_reason: "BUSY", next_action_due_at: due(40) }, outcomeOwner),
  ]);
  assert.ok(retryDuplicate.filter((result) => result.duplicate).length >= 1);
  await startTask(tenant, retry.next_task.id, outcomeOwner);
  const followup = await recordTaskOutcome(tenant, retry.next_task.id, { outcome_event_id: `phase8-follow-up-${suffix}`, contact_result: "CONNECTED", disposition: "FOLLOW_UP_REQUIRED", next_action_due_at: due(60), notes: "Requested a follow-up" }, outcomeOwner);
  assert.equal(followup.next_task.task_type, "FOLLOW_UP");
  mark("start-no-answer-retry-connected-follow-up-and-outcome-idempotency");

  const appointmentLead = await createFixtureLead(`Phase 8 Appointment ${suffix}`, 101, "VBAC", "website");
  const appointmentAssignment = await assignmentTask(appointmentLead.id, caller1.id);
  await startTask(tenant, appointmentAssignment.task.id, outcomeOwner);
  const appointmentOutcome = await recordTaskOutcome(tenant, appointmentAssignment.task.id, { outcome_event_id: `phase8-appointment-${suffix}`, contact_result: "CONNECTED", disposition: "APPOINTMENT_REQUIRED", appointment: { scheduled_at: due(90), service: "VBAC", notes: "UAT consultation" } }, outcomeOwner);
  appointmentIds.push(appointmentOutcome.appointment.id);
  assert.equal(appointmentOutcome.next_task.task_type, "APPOINTMENT_CONFIRMATION");
  await updateAppointment(tenant, appointmentOutcome.appointment.id, { status: "confirmed" }, managerActor);
  await updateAppointment(tenant, appointmentOutcome.appointment.id, { status: "no_show" }, managerActor);
  const noShowTask = await db.BirthwaveTask.findOne({ where: { client_id: clientId, lead_id: appointmentLead.id, task_type: "NO_SHOW_RECOVERY", is_primary: true } });
  assert.ok(noShowTask);
  mark("appointment-confirmed-no-show-continuation");

  const attendedLead = await createFixtureLead(`Phase 8 Attended ${suffix}`, 102, "Fertility", "referral");
  const attendedAssignment = await assignmentTask(attendedLead.id, caller2.id);
  await startTask(tenant, attendedAssignment.task.id, actorFor(caller2, "telecaller"));
  const attendedOutcome = await recordTaskOutcome(tenant, attendedAssignment.task.id, { outcome_event_id: `phase8-attended-${suffix}`, contact_result: "CONNECTED", disposition: "APPOINTMENT_REQUIRED", appointment: { scheduled_at: due(100), service: "Fertility" } }, actorFor(caller2, "telecaller"));
  appointmentIds.push(attendedOutcome.appointment.id);
  await updateAppointment(tenant, attendedOutcome.appointment.id, { status: "completed" }, managerActor);
  assert.equal((await db.BirthwaveLead.findByPk(attendedLead.id)).status, "ATTENDED");
  mark("appointment-attended-continuation");

  const cancelledLead = await createFixtureLead(`Phase 8 Cancelled ${suffix}`, 103, "Pediatrics", "other");
  const cancelledAssignment = await assignmentTask(cancelledLead.id, caller2.id);
  await startTask(tenant, cancelledAssignment.task.id, actorFor(caller2, "telecaller"));
  const cancelledOutcome = await recordTaskOutcome(tenant, cancelledAssignment.task.id, { outcome_event_id: `phase8-cancelled-${suffix}`, contact_result: "CONNECTED", disposition: "APPOINTMENT_REQUIRED", appointment: { scheduled_at: due(110), service: "Pediatrics" } }, actorFor(caller2, "telecaller"));
  appointmentIds.push(cancelledOutcome.appointment.id);
  await updateAppointment(tenant, cancelledOutcome.appointment.id, { status: "cancelled", continuation: { type: "FOLLOW_UP", due_at: due(120), reason: "Customer requested a new date" } }, managerActor);
  mark("appointment-cancelled-continuation");

  const lostLead = await createFixtureLead(`Phase 8 Lost ${suffix}`, 104, "Vaginismus", "instagram");
  const lostAssignment = await assignmentTask(lostLead.id, caller1.id);
  await startTask(tenant, lostAssignment.task.id, outcomeOwner);
  await recordTaskOutcome(tenant, lostAssignment.task.id, { outcome_event_id: `phase8-lost-${suffix}`, contact_result: "CONNECTED", disposition: "NOT_INTERESTED", lost_reason: "PRICE" }, outcomeOwner);
  const invalidLead = await createFixtureLead(`Phase 8 Invalid ${suffix}`, 105, "Newborn", "referral");
  const invalidAssignment = await assignmentTask(invalidLead.id, caller1.id);
  await startTask(tenant, invalidAssignment.task.id, outcomeOwner);
  await recordTaskOutcome(tenant, invalidAssignment.task.id, { outcome_event_id: `phase8-invalid-${suffix}`, contact_result: "CONNECTED", disposition: "WRONG_NUMBER", lost_reason: "WRONG_NUMBER" }, outcomeOwner);
  const terminalRows = await db.BirthwaveLead.findAll({ where: { id: [lostLead.id, invalidLead.id], client_id: clientId }, attributes: ["id", "status"] });
  assert.equal(terminalRows.find((row) => row.id === lostLead.id).status, "LOST");
  assert.equal(terminalRows.find((row) => row.id === invalidLead.id).status, "INVALID");
  mark("lost-invalid-wrong-number-terminal-states");

  const attentionUnassigned = await createFixtureLead(`Phase 8 Attention Unassigned ${suffix}`, 106, "Pregnancy", "website");
  await db.BirthwaveLead.update({ created_at: past(20) }, { where: { client_id: clientId, id: attentionUnassigned.id } });
  const attentionMissingOwner = await createFixtureLead(`Phase 8 Attention Owner ${suffix}`, 107, "VBAC", "website");
  await assignmentTask(attentionMissingOwner.id, caller1.id);
  await db.BirthwaveLead.update({ current_owner_id: null }, { where: { client_id: clientId, id: attentionMissingOwner.id } });
  const attentionMissingNext = await createFixtureLead(`Phase 8 Attention Task ${suffix}`, 108, "Fertility", "other");
  await assignmentTask(attentionMissingNext.id, caller1.id);
  await db.BirthwaveTask.update({ status: "CANCELLED", is_primary: false, cancelled_at: new Date() }, { where: { client_id: clientId, lead_id: attentionMissingNext.id, is_primary: true } });
  const overdueLead = await createFixtureLead(`Phase 8 Attention Overdue ${suffix}`, 109, "Pediatrics", "referral");
  const overdueAssignment = await assignmentTask(overdueLead.id, caller1.id);
  await db.BirthwaveTask.update({ due_at: past(30) }, { where: { client_id: clientId, id: overdueAssignment.task.id } });
  const firstAttentionScan = await reconcileAttention(tenant, adminActor);
  assert.ok(firstAttentionScan.opened >= 4);
  const attentionRows = await listAttention(tenant, { limit: 200 }, adminActor);
  const attentionTypes = new Set(attentionRows.data.filter((row) => leadIds.includes(row.lead_id)).map((row) => row.attention_type));
  assert.ok(attentionTypes.has("UNASSIGNED_LEAD") && attentionTypes.has("MISSING_OWNER") && attentionTypes.has("MISSING_NEXT_ACTION") && attentionTypes.has("TASK_OVERDUE"));
  const attentionItem = attentionRows.data.find((row) => leadIds.includes(row.lead_id));
  assert.ok(attentionItem);
  await updateAttention(tenant, attentionItem.id, "acknowledge", adminActor, "Phase 8 acknowledgement");
  await updateAttention(tenant, attentionItem.id, "dismiss", adminActor, "Phase 8 dismissal");
  await assignLead({ tenant, leadId: attentionUnassigned.id, teamId: primaryTeam.id, ownerId: caller1.id, actor: adminActor });
  await assignLead({ tenant, leadId: attentionMissingOwner.id, teamId: primaryTeam.id, ownerId: caller1.id, actor: adminActor });
  const repairedTask = await createManualTask(tenant, { lead_id: attentionMissingNext.id, team_id: primaryTeam.id, owner_id: caller1.id, due_at: due(30), priority: "NORMAL", is_primary: true }, managerActor);
  assert.ok(repairedTask?.id);
  const secondAttentionScan = await reconcileAttention(tenant, adminActor);
  assert.ok(secondAttentionScan.resolved >= 1);
  mark("attention-detection-dedupe-state-actions-and-auto-resolution");

  const dashboard = await getOperationalDashboard(tenant, { range: "today" }, adminActor);
  assert.ok(dashboard.kpis && dashboard.team_summary.some((row) => row.team.id === primaryTeam.id));
  assert.ok(dashboard.telecaller_summary.some((row) => row.owner.id === caller1.id));
  assert.ok(Array.isArray(dashboard.lead_sources) && Array.isArray(dashboard.service_breakdown));
  mark("dashboard-kpis-source-service-team-telecaller-and-appointment-summaries");

  const concurrentLeads = await Promise.all([110, 111].map((index) => createFixtureLead(`Phase 8 Concurrent ${index} ${suffix}`, index, "Pregnancy", "manual")));
  const concurrentAssignments = await Promise.all(concurrentLeads.map((lead) => assignLeadRoundRobin({ tenant, leadId: lead.id, teamId: primaryTeam.id, actor: adminActor, scopeKey: `phase8-concurrent:${suffix}` })));
  assert.equal(new Set(concurrentAssignments.map((result) => result.assignment.owner_id)).size, 2);
  mark("concurrent-round-robin-assignment");

  const fixtureActiveLeads = await db.BirthwaveLead.findAll({ where: { client_id: clientId, id: leadIds }, attributes: ["id", "status", "current_team_id", "current_owner_id"] });
  for (const lead of fixtureActiveLeads) {
    const stage = ({ new_lead: "NEW", assigned: "ASSIGNED", contacted: "CONTACTED", consultation_booked: "APPOINTMENT_SCHEDULED", visited: "ATTENDED" })[lead.status] || String(lead.status).toUpperCase();
    const active = ["ASSIGNED", "CONTACTING", "CONTACTED", "QUALIFIED", "INTERESTED", "APPOINTMENT_SCHEDULED", "ATTENDED"].includes(stage);
    const primaryCount = await db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: lead.id, is_primary: true, status: { [Op.in]: ["PENDING", "IN_PROGRESS", "OVERDUE"] } } });
    if (active) assert.equal(primaryCount, 1, `Active Lead ${lead.id} has exactly one Primary Next Action`);
    else assert.equal(primaryCount, 0, `Terminal/NEW Lead ${lead.id} has no active Primary Next Action`);
  }
  mark("primary-next-action-invariant-audit");

  console.log(JSON.stringify({ passed: true, client_id: clientId, other_client_id: otherClientId, fixture_leads: leadIds.length, fixture_contacts: [...new Set(contactIds)].length, fixture_teams: teamIds.length, checks }, null, 2));
} finally {
  try {
    const ids = [...new Set(leadIds)];
    if (ids.length) {
      await db.BirthwaveAttentionItem.destroy({ where: { client_id: clientId, lead_id: ids } });
      await db.BirthwaveDisposition.destroy({ where: { client_id: clientId, lead_id: ids } });
      await db.BirthwaveAppointment.destroy({ where: { client_id: clientId, lead_id: ids } });
      await db.BirthwaveTask.update({ parent_task_id: null }, { where: { client_id: clientId, lead_id: ids } });
      await db.BirthwaveTask.destroy({ where: { client_id: clientId, lead_id: ids } });
      await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: ids } });
      await db.BirthwaveLeadAssignment.destroy({ where: { client_id: clientId, lead_id: ids } });
      await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: ids } });
    }
    if (websiteIds.length) await db.BirthwaveWebsiteLead.destroy({ where: { client_id: clientId, id: websiteIds } });
    if (teamIds.length) {
      await db.BirthwaveAssignmentRule.destroy({ where: { client_id: clientId, team_id: teamIds } });
      await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: teamIds } });
      await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: teamIds } });
      await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: teamIds } });
    }
    if (managementIds.length) await db.Management.destroy({ where: { client_id: clientId, id: managementIds } });
    if (contactIds.length) await db.BirthwaveContact.destroy({ where: { client_id: clientId, id: [...new Set(contactIds)] } });
  } finally {
    await db.sequelize.close();
  }
}
