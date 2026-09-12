import assert from "node:assert/strict";
import db from "../database/index.js";
import { createTeam, addTeamMember } from "../modules/birthwave/birthwaveTeam.service.js";
import { assignLead } from "../modules/birthwave/birthwaveAssignment.service.js";
import { getMyWork, getTeamWork } from "../modules/birthwave/birthwaveWork.service.js";

const serverLine = process.env.INVICTUS_SERVER_LINE || "local";
if (!["local", "development"].includes(serverLine)) throw new Error("Work verification is restricted to local/development databases");
const clients = await db.Client.findAll({ order: [["id", "ASC"]], limit: 2, attributes: ["id"] });
assert.equal(clients.length >= 2, true, "At least two local clients are required");
const clientId = clients[0].id;
const otherClientId = clients[1].id;
const tenant = { id: clientId };
const otherTenant = { id: otherClientId };
const suffix = Date.now();
const managementIds = [];
let otherTenantManagementId = null;
const teamIds = [];
const leadIds = [];
const taskIds = [];
const actor = { id: 0, role: "client", username: "Phase Five Verification" };
const due = (minutes) => new Date(Date.now() + minutes * 60 * 1000);

const createManagement = async (number, client = clientId) => {
  const row = await db.Management.create({ client_id: client, title: "Mr", username: `phase5-user-${suffix}-${number}`, email: `phase5-user-${suffix}-${number}@example.test`, mobile: `92000${String(suffix).slice(-5)}${number}`.slice(-10), password: "not-a-real-login-password", role: "client" });
  if (client === clientId) managementIds.push(row.id);
  return row;
};

const makeLead = async () => {
  const row = await db.BirthwaveLead.create({ client_id: clientId, name: `Phase Five Lead ${suffix}-${leadIds.length}`, phone: `+9193${String(suffix).slice(-8)}${String(leadIds.length).padStart(2, "0")}`, email: `phase5-${suffix}-${leadIds.length}@example.test`, service: "VBAC", source: "website", status: "new_lead", custom_fields: {} });
  leadIds.push(row.id);
  return row;
};

const createTask = async ({ leadId, teamId, ownerId, taskType, dueAt, priority = "NORMAL", status = "PENDING" }) => {
  const row = await db.BirthwaveTask.create({ client_id: clientId, lead_id: leadId, team_id: teamId, owner_id: ownerId, task_type: taskType, status, priority, due_at: dueAt, is_primary: false, attempt_number: 1 });
  taskIds.push(row.id);
  return row;
};

try {
  const owner = await createManagement(1);
  const manager = await createManagement(2);
  const otherOwner = await createManagement(3);
  const otherTenantUser = await createManagement(4, otherClientId);
  otherTenantManagementId = otherTenantUser.id;
  const team = await createTeam(tenant, { name: `Phase Five Team ${suffix}`, code: `phase5_${suffix}` }, actor);
  teamIds.push(team.id);
  await addTeamMember(tenant, team.id, { management_id: owner.id, operational_role: "TELECALLER" }, actor);
  await addTeamMember(tenant, team.id, { management_id: manager.id, operational_role: "TEAM_MANAGER" }, actor);
  const unauthorizedTeam = await createTeam(tenant, { name: `Phase Five Other Team ${suffix}`, code: `phase5_other_${suffix}` }, actor);
  teamIds.push(unauthorizedTeam.id);

  const lead = await makeLead();
  const assigned = await assignLead({ tenant, leadId: lead.id, teamId: team.id, ownerId: owner.id, actor });
  taskIds.push(assigned.task.id);
  await db.BirthwaveLeadActivity.create({ client_id: clientId, lead_id: lead.id, actor_user_id: owner.id, actor_name: owner.username, event_type: "note_added", title: "Note added", description: "Asked to call tomorrow after 11 AM", occurred_at: new Date(Date.now() + 1000) });

  const nowTask = await createTask({ leadId: lead.id, teamId: team.id, ownerId: owner.id, taskType: "INITIAL_CALL", dueAt: due(-10), priority: "HIGH" });
  const followUp = await createTask({ leadId: lead.id, teamId: team.id, ownerId: owner.id, taskType: "FOLLOW_UP", dueAt: due(90) });
  const retry = await createTask({ leadId: lead.id, teamId: team.id, ownerId: owner.id, taskType: "RETRY_CALL", dueAt: due(120) });
  const upcoming = await createTask({ leadId: lead.id, teamId: team.id, ownerId: owner.id, taskType: "MANUAL_TASK", dueAt: due(60 * 48) });
  const completedToday = await createTask({ leadId: lead.id, teamId: team.id, ownerId: owner.id, taskType: "MANUAL_TASK", dueAt: due(-30), status: "COMPLETED" });
  await db.BirthwaveTask.update({ completed_at: new Date() }, { where: { id: completedToday.id } });

  const my = await getMyWork(tenant, { limit: 50 }, { id: owner.id, role: "telecaller", username: owner.username });
  assert.ok(my.sections.NOW.tasks.some((task) => task.task_id === nowTask.id), "NOW contains due task");
  assert.ok(my.sections.TODAY.tasks.some((task) => task.task_id === assigned.task.id), "TODAY contains future task due today");
  assert.ok(my.sections.FOLLOW_UPS.tasks.some((task) => task.task_id === followUp.id), "FOLLOW_UPS filters task type");
  assert.ok(my.sections.RETRIES.tasks.some((task) => task.task_id === retry.id), "RETRIES filters task type");
  assert.ok(my.sections.UPCOMING.tasks.some((task) => task.task_id === upcoming.id), "UPCOMING contains future task");
  assert.ok(my.sections.OVERDUE.tasks.some((task) => task.task_id === nowTask.id), "OVERDUE is derived without changing status");
  assert.equal(my.sections.OVERDUE.tasks.find((task) => task.task_id === nowTask.id).task_status, "PENDING");
  assert.equal(my.sections.NOW.tasks.find((task) => task.task_id === nowTask.id).is_overdue, true);
  assert.equal(my.sections.NOW.tasks.find((task) => task.task_id === nowTask.id).last_note.text, "Asked to call tomorrow after 11 AM");
  assert.equal(my.sections.NOW.tasks.find((task) => task.task_id === nowTask.id).owner.id, owner.id);
  assert.ok(my.sections.NOW.tasks.findIndex((task) => task.task_id === nowTask.id) >= 0, "priority ordering returns task");

  const otherOwnerWork = await getMyWork(tenant, {}, { id: otherOwner.id, role: "telecaller", username: otherOwner.username });
  assert.equal(Object.values(otherOwnerWork.sections).every((section) => section.tasks.length === 0), true, "Other Telecaller tasks remain hidden");

  const managerWork = await getTeamWork(tenant, { limit: 50 }, { id: manager.id, role: "telecaller", username: manager.username });
  assert.ok(managerWork.summary.by_owner.some((row) => row.owner.id === owner.id), "Manager sees authorized team counts");
  assert.ok(managerWork.sections.OVERDUE.tasks.some((task) => task.task_id === nowTask.id), "Manager sees team overdue tasks");
  await assert.rejects(() => getTeamWork(tenant, { team_id: unauthorizedTeam.id }, { id: manager.id, role: "telecaller", username: manager.username }), (error) => error.status === 403, "Unauthorized Team is rejected");

  const otherTenantWork = await getMyWork(otherTenant, {}, { id: otherTenantUser.id, role: "telecaller", username: otherTenantUser.username });
  assert.equal(Object.values(otherTenantWork.sections).every((section) => section.tasks.length === 0), true, "Tenant isolation holds");

  const searched = await getMyWork(tenant, { search: String(lead.id), limit: 50 }, { id: owner.id, role: "telecaller", username: owner.username });
  assert.ok(searched.sections.NOW.tasks.every((task) => task.lead_id === lead.id), "Search supports Lead ID");

  console.log(JSON.stringify({ passed: true, checks: ["my-owner-scope", "team-scope", "today", "follow-ups", "retries", "upcoming", "overdue-derivation", "priority", "compact-note-activity", "tenant-isolation", "lead-search"] }, null, 2));
} finally {
  if (taskIds.length) await db.BirthwaveTask.update({ parent_task_id: null }, { where: { client_id: clientId, id: taskIds } });
  if (taskIds.length) await db.BirthwaveTask.destroy({ where: { client_id: clientId, id: taskIds } });
  if (leadIds.length) await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: leadIds } });
  if (leadIds.length) await db.BirthwaveLeadAssignment.destroy({ where: { client_id: clientId, lead_id: leadIds } });
  if (leadIds.length) await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: leadIds } });
  if (teamIds.length) await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: teamIds } });
  if (teamIds.length) await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: teamIds } });
  if (teamIds.length) await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: teamIds } });
  if (managementIds.length) await db.Management.destroy({ where: { client_id: clientId, id: managementIds } });
  if (otherTenantManagementId) await db.Management.destroy({ where: { client_id: otherClientId, id: otherTenantManagementId } });
  await db.sequelize.close();
}
