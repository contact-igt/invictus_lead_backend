import assert from "node:assert/strict";
import db from "../database/index.js";
import { createTeam, addTeamMember } from "../modules/birthwave/birthwaveTeam.service.js";
import { assignLead, assignLeadRoundRobin, bulkAssignLeads } from "../modules/birthwave/birthwaveAssignment.service.js";
import { createManualTask, listTasks, getTaskById, startTask, completeTask, rescheduleTask, cancelTask, repairAssignedLeadTask } from "../modules/birthwave/birthwaveTask.service.js";

const serverLine = process.env.INVICTUS_SERVER_LINE || "local";
if (!["local", "development"].includes(serverLine)) throw new Error("Task verification is restricted to local/development databases");
const clients = await db.Client.findAll({ order: [["id", "ASC"]], limit: 2, attributes: ["id"] });
assert.equal(clients.length >= 2, true, "At least two local clients are required");
const clientId = clients[0].id;
const otherClientId = clients[1].id;
const tenant = { id: clientId };
const otherTenant = { id: otherClientId };
const suffix = Date.now();
const managementIds = [];
const teamIds = [];
const leadIds = [];
const actor = { id: 0, role: "client", username: "Phase Four Verification" };
let originalTaskCreate = null;
const due = (minutes) => new Date(Date.now() + minutes * 60 * 1000);

const createManagement = async (number) => {
  const row = await db.Management.create({ client_id: clientId, title: "Mr", username: `phase4-user-${suffix}-${number}`, email: `phase4-user-${suffix}-${number}@example.test`, mobile: `91000${String(suffix).slice(-5)}${number}`.slice(-10), password: "not-a-real-login-password", role: "client" });
  managementIds.push(row.id);
  return row;
};
const makeLead = async (service = "VBAC", clientIdOverride = clientId) => {
  const row = await db.BirthwaveLead.create({ client_id: clientIdOverride, name: `Phase Four Lead ${suffix}-${leadIds.length}`, phone: `+9192${String(suffix).slice(-8)}${String(leadIds.length).padStart(2, "0")}`, service, source: "website", status: "new_lead", custom_fields: {} });
  if (clientIdOverride === clientId) leadIds.push(row.id);
  return row;
};
const activePrimaryCount = (leadId) => db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: leadId, is_primary: true, status: ["PENDING", "IN_PROGRESS", "OVERDUE"] } });

try {
  const userA = await createManagement(1);
  const userB = await createManagement(2);
  const userC = await createManagement(3);
  const team = await createTeam(tenant, { name: `Phase Four Team ${suffix}`, code: `phase4_${suffix}` }, actor);
  teamIds.push(team.id);
  await addTeamMember(tenant, team.id, { management_id: userA.id, operational_role: "TELECALLER" }, actor);
  await addTeamMember(tenant, team.id, { management_id: userB.id, operational_role: "TELECALLER" }, actor);
  await addTeamMember(tenant, team.id, { management_id: userC.id, operational_role: "TEAM_MANAGER" }, actor);

  const lead = await makeLead();
  const assigned = await assignLead({ tenant, leadId: lead.id, teamId: team.id, ownerId: userA.id, actor });
  assert.equal(assigned.task.task_type, "INITIAL_CALL", "Manual assignment creates Initial Call Task");
  assert.equal(assigned.task.is_primary, true);
  assert.equal((await activePrimaryCount(lead.id)), 1, "Assigned Lead has one active Primary Task");

  const ownerActor = { id: userA.id, role: "telecaller", username: userA.username };
  await startTask(tenant, assigned.task.id, ownerActor);
  await assert.rejects(() => completeTask(tenant, assigned.task.id, { completion_reason: "Needs manager follow-up" }, ownerActor), (error) => error.status === 403);
  const completed = await completeTask(tenant, assigned.task.id, { completion_reason: "Initial call completed", successor: { task_type: "MANUAL_TASK", due_at: due(120) } }, actor);
  assert.equal(completed.status, "COMPLETED");
  const successor = (await db.BirthwaveTask.findOne({ where: { client_id: clientId, lead_id: lead.id, parent_task_id: assigned.task.id } }));
  assert.ok(successor, "Completing with a successor preserves task lineage");
  assert.equal((await activePrimaryCount(lead.id)), 1);
  const rescheduled = await rescheduleTask(tenant, successor.id, { due_at: due(180), reason: "Customer requested another time" }, ownerActor);
  assert.equal(rescheduled.parent_task_id, successor.id, "Reschedule creates a linked successor Task");
  assert.equal((await db.BirthwaveTask.findByPk(successor.id)).status, "RESCHEDULED");
  await assert.rejects(() => cancelTask(tenant, rescheduled.id, { reason: "Telecaller cannot cancel primary without manager" }, ownerActor), (error) => error.status === 403);
  await cancelTask(tenant, rescheduled.id, { reason: "Manager closed action pending operational exception" }, actor);
  assert.equal(await activePrimaryCount(lead.id), 0, "Manager cancellation records the missing-next-action path");
  assert.equal(await db.BirthwaveLeadActivity.count({ where: { client_id: clientId, lead_id: lead.id, event_type: "missing_next_action" } }), 1, "Controlled orphaning records MISSING_NEXT_ACTION activity");

  const reassignedLead = await makeLead();
  const first = await assignLead({ tenant, leadId: reassignedLead.id, teamId: team.id, ownerId: userA.id, actor });
  const reassigned = await assignLead({ tenant, leadId: reassignedLead.id, teamId: team.id, ownerId: userB.id, actor, reason: "Ownership change" });
  assert.equal((await db.BirthwaveTask.findByPk(first.task.id)).status, "CANCELLED", "Reassignment closes old owner Task");
  assert.equal(reassigned.task.parent_task_id, first.task.id, "Reassignment creates successor owner Task");
  assert.equal(reassigned.task.owner_id, userB.id);
  assert.equal(await activePrimaryCount(reassignedLead.id), 1, "Reassignment keeps one Primary Task");

  const rrLead = await makeLead("Pregnancy Care");
  const roundRobin = await assignLeadRoundRobin({ tenant, leadId: rrLead.id, teamId: team.id, actor });
  assert.equal(roundRobin.assigned, true);
  assert.equal(roundRobin.task.task_type, "INITIAL_CALL", "Round robin creates Initial Call Task");
  const bulkLeads = await Promise.all([makeLead(), makeLead()]);
  const bulk = await bulkAssignLeads({ tenant, leadIds: bulkLeads.map((item) => item.id), teamId: team.id, ownerId: userA.id, actor });
  assert.equal(bulk.success_count, 2);
  assert.equal(bulk.results.every((item) => item.assignment_id && item.task_id && item.owner_id && item.team_id), true, "Bulk results include assignment and task IDs");

  const manualTask = await createManualTask(tenant, { lead_id: lead.id, team_id: team.id, owner_id: userA.id, due_at: due(240), priority: "HIGH" }, actor);
  assert.equal(manualTask.task_type, "MANUAL_TASK");
  await assert.rejects(() => createManualTask(tenant, { lead_id: lead.id, team_id: team.id, owner_id: userB.id, due_at: due(240) }, ownerActor), (error) => error.status === 403);

  const taskList = await listTasks(tenant, { lead_id: lead.id }, ownerActor);
  assert.equal(taskList.data.every((item) => item.owner_id === userA.id), true, "Telecaller task list is owner-scoped");
  const otherList = await listTasks(otherTenant, {}, actor);
  assert.equal(otherList.data.some((item) => item.id === assigned.task.id), false, "Task list remains tenant-scoped");
  await assert.rejects(() => getTaskById(otherTenant, assigned.task.id, actor), (error) => error.status === 404);

  const rollbackLead = await makeLead();
  originalTaskCreate = db.BirthwaveTask.create;
  db.BirthwaveTask.create = async () => { throw new Error("forced task failure"); };
  await assert.rejects(() => assignLead({ tenant, leadId: rollbackLead.id, teamId: team.id, ownerId: userA.id, actor }));
  db.BirthwaveTask.create = originalTaskCreate;
  originalTaskCreate = null;
  const rollbackState = await db.BirthwaveLead.findByPk(rollbackLead.id);
  assert.equal(rollbackState.current_owner_id, null, "Assignment rolls back when Initial Call creation fails");
  assert.equal(await db.BirthwaveLeadAssignment.count({ where: { client_id: clientId, lead_id: rollbackLead.id } }), 0);

  const repairLead = await makeLead();
  await repairLead.update({ current_team_id: team.id, current_owner_id: userA.id, status: "assigned" });
  const repairTransaction = await db.sequelize.transaction();
  const repaired = await repairAssignedLeadTask({ clientId, leadId: repairLead.id, actor, transaction: repairTransaction });
  await repairTransaction.commit();
  assert.equal(repaired.created, true, "Assigned Lead repair creates missing Primary Task");
  const repairRerunTransaction = await db.sequelize.transaction();
  const repairRerun = await repairAssignedLeadTask({ clientId, leadId: repairLead.id, actor, transaction: repairRerunTransaction });
  await repairRerunTransaction.commit();
  assert.equal(repairRerun.created, false, "Assigned Lead repair is idempotent");

  console.log(JSON.stringify({ passed: true, checks: [
    "task-creation", "tenant-isolation", "owner-and-team-validation", "task-start", "task-complete", "task-cancel", "task-reschedule", "task-lineage", "primary-task-switching", "manual-assignment-initial-task", "round-robin-initial-task", "bulk-initial-tasks", "assignment-rollback", "reassignment-successor-task", "no-duplicate-primary", "assigned-lead-repair",
  ] }, null, 2));
} finally {
  if (originalTaskCreate) db.BirthwaveTask.create = originalTaskCreate;
  if (leadIds.length) { await db.BirthwaveTask.update({ parent_task_id: null }, { where: { client_id: clientId, lead_id: leadIds } }); await db.BirthwaveTask.destroy({ where: { client_id: clientId, lead_id: leadIds } }); }
  if (leadIds.length) await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: leadIds } });
  if (leadIds.length) await db.BirthwaveLeadAssignment.destroy({ where: { client_id: clientId, lead_id: leadIds } });
  if (leadIds.length) await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: leadIds } });
  if (teamIds.length) await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: teamIds } });
  if (teamIds.length) await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: teamIds } });
  if (teamIds.length) await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: teamIds } });
  if (managementIds.length) await db.Management.destroy({ where: { client_id: clientId, id: managementIds } });
  await db.sequelize.close();
}
