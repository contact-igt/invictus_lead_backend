import bcrypt from "bcrypt";
import db from "../database/index.js";
import { createWebsiteLead, promoteWebsiteLead } from "../modules/birthwave/birthwaveWebsiteLead.service.js";
import { createLead } from "../modules/birthwave/birthwave.service.js";
import { createTeam, addTeamMember } from "../modules/birthwave/birthwaveTeam.service.js";
import { createAssignmentRule, assignLead } from "../modules/birthwave/birthwaveAssignment.service.js";
import { startTask } from "../modules/birthwave/birthwaveTask.service.js";
import { recordTaskOutcome } from "../modules/birthwave/birthwaveOutcome.service.js";
import { updateAppointment } from "../modules/birthwave/birthwave.service.js";
import { reconcileAttention } from "../modules/birthwave/birthwaveAttention.service.js";

if (!["local", "development"].includes(process.env.INVICTUS_SERVER_LINE || "local")) {
  throw new Error("Demo seeding is restricted to local/development databases");
}

const client = await db.Client.findOne({ order: [["id", "ASC"]] });
if (!client) throw new Error("A local client is required");
const clientId = client.id;
const password = "BirthwaveDemo!2026";
const adminActor = { id: 0, role: "admin", username: "phase9-demo-admin" };
const demoEmail = (label) => `phase9.demo.${label}@example.test`;
const demoPhone = (number) => `+9198000${String(number).padStart(5, "0")}`;
const demoLeadName = (label) => `Phase 9 Demo ${label}`;
const due = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();
const past = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
const managementIds = [];
const teamIds = [];
const leadIds = [];
const websiteIds = [];

const cleanup = async () => {
  const leads = await db.BirthwaveLead.findAll({ where: { client_id: clientId, name: { [db.Sequelize.Op.like]: "Phase 9 Demo %" } }, attributes: ["id", "contact_id"] });
  const ids = leads.map((row) => row.id);
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
  await db.BirthwaveWebsiteLead.destroy({ where: { client_id: clientId, name: { [db.Sequelize.Op.like]: "Phase 9 Demo %" } } });
  const teams = await db.BirthwaveTeam.findAll({ where: { client_id: clientId, code: { [db.Sequelize.Op.like]: "phase9_demo_%" } }, attributes: ["id"] });
  const idsForTeams = teams.map((row) => row.id);
  if (idsForTeams.length) {
    await db.BirthwaveAssignmentRule.destroy({ where: { client_id: clientId, team_id: idsForTeams } });
    await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: idsForTeams } });
    await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: idsForTeams } });
    await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: idsForTeams } });
  }
  await db.Management.destroy({ where: { client_id: clientId, email: { [db.Sequelize.Op.like]: "phase9.demo.%@example.test" } } });
  const contacts = await db.BirthwaveContact.findAll({ where: { client_id: clientId, display_name: { [db.Sequelize.Op.like]: "Phase 9 Demo %" } }, attributes: ["id"] });
  if (contacts.length) await db.BirthwaveContact.destroy({ where: { client_id: clientId, id: contacts.map((row) => row.id) } });
};

const createUser = async (label, role = "client") => {
  const row = await db.Management.create({
    client_id: clientId,
    title: "Mr",
    username: `phase9-demo-${label}`,
    email: demoEmail(label),
    mobile: `98${label.length}${String(Date.now()).slice(-8)}`,
    password: await bcrypt.hash(password, 10),
    role,
  });
  managementIds.push(row.id);
  return row;
};

const createDemoLead = async (label, service, source, index) => {
  const row = await createLead({ id: clientId }, {
    name: demoLeadName(label),
    phone: demoPhone(index),
    email: demoEmail(`lead-${index}`),
    service,
    source,
    status: "NEW",
  }, adminActor);
  leadIds.push(row.id);
  return row;
};

const run = async () => {
  await cleanup();
  const admin = await createUser("admin", "admin");
  const manager = await createUser("manager");
  const telecallerOne = await createUser("telecaller-one");
  const telecallerTwo = await createUser("telecaller-two");
  const managerActor = { id: manager.id, role: "team_manager", username: manager.username };
  const callerOneActor = { id: telecallerOne.id, role: "telecaller", username: telecallerOne.username };
  const callerTwoActor = { id: telecallerTwo.id, role: "telecaller", username: telecallerTwo.username };

  const counselling = await createTeam({ id: clientId }, { name: "Phase 9 Demo Counselling", code: "phase9_demo_counselling" }, adminActor);
  const escalation = await createTeam({ id: clientId }, { name: "Phase 9 Demo Escalation", code: "phase9_demo_escalation" }, adminActor);
  teamIds.push(counselling.id, escalation.id);
  await addTeamMember({ id: clientId }, counselling.id, { management_id: manager.id, operational_role: "TEAM_MANAGER" }, adminActor);
  await addTeamMember({ id: clientId }, counselling.id, { management_id: telecallerOne.id, operational_role: "TELECALLER" }, adminActor);
  await addTeamMember({ id: clientId }, counselling.id, { management_id: telecallerTwo.id, operational_role: "TELECALLER" }, adminActor);
  await addTeamMember({ id: clientId }, escalation.id, { management_id: manager.id, operational_role: "TEAM_MANAGER" }, adminActor);
  await createAssignmentRule({ id: clientId }, { name: "Phase 9 Demo Website Round Robin", priority: 1, service: "Pregnancy Care", source: "website", team_id: counselling.id, assignment_method: "ROUND_ROBIN" }, adminActor);

  const website = await createWebsiteLead(clientId, { source_key: "birthwave_pregnancycare", external_submission_id: "phase9-demo-website", name: demoLeadName("Website New"), phone: demoPhone(1), email: demoEmail("website"), service: "Pregnancy Care", consent: true, attribution: { source: "website", campaign: "phase9-demo", channel: "Form" } }, { skipSheetSync: true });
  websiteIds.push(website.id);
  const promoted = await promoteWebsiteLead(clientId, website.id, adminActor);
  leadIds.push(promoted.birthwave_lead_id);

  const fresh = [];
  const definitions = [
    ["Assigned", "VBAC", "referral", 2], ["Initial Call", "Fertility", "instagram", 3], ["Retry", "Pregnancy Care", "website", 4],
    ["Follow-up", "Vaginismus", "other", 5], ["Appointment", "VBAC", "website", 6], ["No Show", "Fertility", "referral", 7],
    ["Lost", "Newborn", "instagram", 8], ["Attention Overdue", "Pediatrics", "other", 9], ["Invalid", "Pregnancy Care", "referral", 10],
    ["Upcoming", "VBAC", "website", 11], ["Manager Queue", "Fertility", "other", 12],
  ];
  for (const definition of definitions) fresh.push(await createDemoLead(...definition));

  const assigned = await assignLead({ tenant: { id: clientId }, leadId: fresh[0].id, teamId: counselling.id, ownerId: telecallerOne.id, actor: adminActor });
  await assignLead({ tenant: { id: clientId }, leadId: fresh[1].id, teamId: counselling.id, ownerId: telecallerTwo.id, actor: adminActor });
  await assignLead({ tenant: { id: clientId }, leadId: fresh[2].id, teamId: counselling.id, ownerId: telecallerOne.id, actor: adminActor });
  await startTask({ id: clientId }, assigned.task.id, callerOneActor);
  const retry = await recordTaskOutcome({ id: clientId }, assigned.task.id, { outcome_event_id: "phase9-demo-retry", contact_result: "NOT_REACHED", not_reached_reason: "NO_ANSWER", next_action_due_at: due(30) }, callerOneActor);
  await startTask({ id: clientId }, retry.next_task.id, callerOneActor);
  const followUp = await recordTaskOutcome({ id: clientId }, retry.next_task.id, { outcome_event_id: "phase9-demo-followup", contact_result: "CONNECTED", disposition: "FOLLOW_UP_REQUIRED", next_action_due_at: due(90), notes: "Demo follow-up requested" }, callerOneActor);
  await startTask({ id: clientId }, followUp.next_task.id, callerOneActor);
  const appointment = await recordTaskOutcome({ id: clientId }, followUp.next_task.id, { outcome_event_id: "phase9-demo-appointment", contact_result: "CONNECTED", disposition: "APPOINTMENT_REQUIRED", appointment: { scheduled_at: due(180), service: "Vaginismus", notes: "Demo appointment" } }, callerOneActor);
  await updateAppointment({ id: clientId }, appointment.appointment.id, { status: "confirmed" }, managerActor);

  const noShowAssignment = await assignLead({ tenant: { id: clientId }, leadId: fresh[5].id, teamId: counselling.id, ownerId: telecallerTwo.id, actor: adminActor });
  await startTask({ id: clientId }, noShowAssignment.task.id, callerTwoActor);
  const noShowAppointment = await recordTaskOutcome({ id: clientId }, noShowAssignment.task.id, { outcome_event_id: "phase9-demo-no-show-appointment", contact_result: "CONNECTED", disposition: "APPOINTMENT_REQUIRED", appointment: { scheduled_at: due(210), service: "Fertility" } }, callerTwoActor);
  await updateAppointment({ id: clientId }, noShowAppointment.appointment.id, { status: "no_show" }, managerActor);

  const lostAssignment = await assignLead({ tenant: { id: clientId }, leadId: fresh[6].id, teamId: counselling.id, ownerId: telecallerOne.id, actor: adminActor });
  await startTask({ id: clientId }, lostAssignment.task.id, callerOneActor);
  await recordTaskOutcome({ id: clientId }, lostAssignment.task.id, { outcome_event_id: "phase9-demo-lost", contact_result: "CONNECTED", disposition: "NOT_INTERESTED", lost_reason: "PRICE" }, callerOneActor);

  const invalidAssignment = await assignLead({ tenant: { id: clientId }, leadId: fresh[8].id, teamId: counselling.id, ownerId: telecallerTwo.id, actor: adminActor });
  await startTask({ id: clientId }, invalidAssignment.task.id, callerTwoActor);
  await recordTaskOutcome({ id: clientId }, invalidAssignment.task.id, { outcome_event_id: "phase9-demo-invalid", contact_result: "CONNECTED", disposition: "WRONG_NUMBER", lost_reason: "WRONG_NUMBER" }, callerTwoActor);

  const overdueAssignment = await assignLead({ tenant: { id: clientId }, leadId: fresh[7].id, teamId: counselling.id, ownerId: telecallerOne.id, actor: adminActor });
  await db.BirthwaveTask.update({ due_at: past(30) }, { where: { client_id: clientId, id: overdueAssignment.task.id } });
  await reconcileAttention({ id: clientId }, adminActor);
  await assignLead({ tenant: { id: clientId }, leadId: fresh[9].id, teamId: counselling.id, ownerId: telecallerTwo.id, actor: adminActor });
  await assignLead({ tenant: { id: clientId }, leadId: fresh[10].id, teamId: escalation.id, ownerId: manager.id, actor: adminActor });

  console.log(JSON.stringify({ seeded: true, client_id: clientId, admin_email: admin.email, manager_email: manager.email, telecaller_emails: [telecallerOne.email, telecallerTwo.email], demo_password: password, teams: teamIds, leads: leadIds, website_leads: websiteIds, note: "Synthetic local demo data only" }, null, 2));
};

try {
  await run();
} finally {
  await db.sequelize.close();
}
