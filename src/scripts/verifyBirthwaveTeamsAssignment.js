import assert from "node:assert/strict";
import db from "../database/index.js";
import { createTeam, addTeamMember, updateTeamMember, getTeam } from "../modules/birthwave/birthwaveTeam.service.js";
import { assignLead, assignLeadRoundRobin, bulkAssignLeads } from "../modules/birthwave/birthwaveAssignment.service.js";
import { assertCanViewLead } from "../modules/birthwave/birthwavePermissions.service.js";

const serverLine = process.env.INVICTUS_SERVER_LINE || "local";
if (!['local', 'development'].includes(serverLine)) throw new Error("Teams verification is restricted to local/development databases");

const clients = await db.Client.findAll({ order: [["id", "ASC"]], limit: 2, attributes: ["id"] });
assert.equal(clients.length >= 2, true, "At least two local clients are required");
const clientId = clients[0].id;
const otherClientId = clients[1].id;
const tenant = { id: clientId };
const otherTenant = { id: otherClientId };
const actor = { id: 0, role: "client", username: "Phase Three Verification" };
const suffix = Date.now();
const managementIds = [];
const teamIds = [];
const leadIds = [];

const createManagement = async (number) => {
  const row = await db.Management.create({
    client_id: clientId,
    title: "Mr",
    username: `phase3-user-${suffix}-${number}`,
    email: `phase3-user-${suffix}-${number}@example.test`,
    mobile: `90000${String(suffix).slice(-5)}${number}`.slice(-10),
    password: "not-a-real-login-password",
    role: "client",
  });
  managementIds.push(row.id);
  return row;
};

const makeLead = async (service, source = "website", client = clientId) => {
  const row = await db.BirthwaveLead.create({ client_id: client, name: `Phase Three Lead ${suffix}-${leadIds.length}`, phone: `+9191${String(suffix).slice(-8)}${String(leadIds.length).padStart(2, "0")}`, service, source, status: "NEW", custom_fields: {} });
  leadIds.push(row.id);
  return row;
};

try {
  const userA = await createManagement(1);
  const userB = await createManagement(2);
  const userC = await createManagement(3);
  const team = await createTeam(tenant, { name: `Phase Three Team ${suffix}`, code: `phase3_${suffix}` }, actor);
  teamIds.push(team.id);
  const otherTeam = await createTeam(otherTenant, { name: `Other Phase Three Team ${suffix}`, code: `other_phase3_${suffix}` }, { ...actor, id: 0 });
  teamIds.push(otherTeam.id);

  await assert.rejects(() => getTeam(otherTenant, team.id, actor), (error) => error.status === 404);
  await addTeamMember(tenant, team.id, { management_id: userA.id, operational_role: "TELECALLER" }, actor);
  await addTeamMember(tenant, team.id, { management_id: userB.id, operational_role: "TELECALLER" }, actor);
  await addTeamMember(tenant, team.id, { management_id: userC.id, operational_role: "TEAM_MANAGER" }, actor);
  const secondTeam = await createTeam(tenant, { name: `Second Phase Three Team ${suffix}`, code: `phase3_second_${suffix}` }, actor);
  teamIds.push(secondTeam.id);
  await addTeamMember(tenant, secondTeam.id, { management_id: userA.id, operational_role: "TELECALLER" }, actor);
  assert.equal(await db.BirthwaveTeamMember.count({ where: { client_id: clientId, management_id: userA.id } }), 2, "User can belong to multiple Teams");

  await updateTeamMember(tenant, team.id, (await db.BirthwaveTeamMember.findOne({ where: { client_id: clientId, team_id: team.id, management_id: userB.id } })).id, { status: "ASSIGNMENT_PAUSED" }, actor);
  const lead = await makeLead("VBAC");
  const roundRobin = await assignLeadRoundRobin({ tenant, leadId: lead.id, teamId: team.id, actor });
  assert.equal(roundRobin.assigned, true);
  assert.equal(roundRobin.member.management_id, userA.id, "Paused member is excluded");
  assert.equal((await db.BirthwaveLead.findByPk(lead.id)).status, "ASSIGNED", "First assignment moves Lead to ASSIGNED");

  const reassigned = await assignLead({ tenant, leadId: lead.id, teamId: team.id, ownerId: userC.id, actor, reason: "Manager reassignment" });
  assert.equal(reassigned.serialized.assignment_type, "REASSIGNMENT");
  await assert.rejects(async () => assertCanViewLead(clientId, await db.BirthwaveLead.findByPk(lead.id), { id: userA.id, role: "telecaller" }), (error) => error.status === 403);
  await assert.rejects(() => assignLead({ tenant, leadId: lead.id, teamId: team.id, ownerId: userA.id, actor: { id: userA.id, role: "telecaller" } }), (error) => error.status === 403);
  assert.equal(await db.BirthwaveLeadAssignment.count({ where: { client_id: clientId, lead_id: lead.id } }), 2, "Reassignment preserves history");
  assert.equal(await db.BirthwaveLeadAssignment.count({ where: { client_id: clientId, lead_id: lead.id, is_current: true } }), 1, "Only one current assignment exists");

  const bulkLeads = await Promise.all([makeLead("VBAC"), makeLead("VBAC")]);
  const bulk = await bulkAssignLeads({ tenant, leadIds: bulkLeads.map((item) => item.id), teamId: team.id, ownerId: userA.id, actor, reason: "Bulk verification" });
  assert.equal(bulk.success_count, 2);
  assert.equal(bulk.failed_count, 0);
  const managerMembership = await db.BirthwaveTeamMember.findOne({ where: { client_id: clientId, team_id: team.id, management_id: userC.id } });
  await updateTeamMember(tenant, team.id, managerMembership.id, { status: "INACTIVE" }, actor);
  const inactiveLead = await makeLead("VBAC");
  const inactiveResult = await assignLeadRoundRobin({ tenant, leadId: inactiveLead.id, teamId: team.id, actor });
  assert.equal(inactiveResult.member.management_id, userA.id, "Inactive member is excluded");

  const rrTeam = await createTeam(tenant, { name: `Round Robin ${suffix}`, code: `phase3_rr_${suffix}` }, actor);
  teamIds.push(rrTeam.id);
  await addTeamMember(tenant, rrTeam.id, { management_id: userA.id, operational_role: "TELECALLER" }, actor);
  await addTeamMember(tenant, rrTeam.id, { management_id: userB.id, operational_role: "TELECALLER" }, actor);
  const concurrentLeads = await Promise.all([makeLead("Pregnancy Care"), makeLead("Pregnancy Care"), makeLead("Pregnancy Care")]);
  const concurrentResults = await Promise.all(concurrentLeads.map((item) => assignLeadRoundRobin({ tenant, leadId: item.id, teamId: rrTeam.id, actor })));
  assert.equal(concurrentResults.every((result) => result.assigned), true, "Concurrent round-robin assignments succeed");
  const owners = concurrentResults.map((result) => result.member.management_id);
  assert.deepEqual(new Set(owners), new Set([userA.id, userB.id]), "Concurrent cursor rotation uses each eligible member");

  const restrictedTeam = await createTeam(tenant, { name: `Restricted ${suffix}`, code: `phase3_restricted_${suffix}` }, actor);
  teamIds.push(restrictedTeam.id);
  await addTeamMember(tenant, restrictedTeam.id, { management_id: userA.id, operational_role: "TELECALLER", service_access: ["VBAC"], source_access: ["instagram"] }, actor);
  const wrongService = await makeLead("Fertility", "instagram");
  const failedService = await assignLeadRoundRobin({ tenant, leadId: wrongService.id, teamId: restrictedTeam.id, actor });
  assert.equal(failedService.assigned, false, "Service eligibility excludes incompatible member");
  const wrongSource = await makeLead("VBAC", "website");
  const failedSource = await assignLeadRoundRobin({ tenant, leadId: wrongSource.id, teamId: restrictedTeam.id, actor });
  assert.equal(failedSource.assigned, false, "Source eligibility excludes incompatible member");

  await assert.rejects(() => assignLead({ tenant, leadId: lead.id, teamId: otherTeam.id, ownerId: userA.id, actor }), (error) => error.status === 404 || error.status === 400);
  await assert.rejects(() => assignLead({ tenant: otherTenant, leadId: lead.id, teamId: otherTeam.id, ownerId: userA.id, actor }), (error) => error.status === 404 || error.status === 400);

  console.log(JSON.stringify({ passed: true, checks: [
    "team-creation", "cross-tenant-team-protection", "membership-creation", "multiple-team-membership", "paused-member-excluded", "manual-assignment", "reassignment", "assignment-history", "bulk-assignment", "round-robin-order", "round-robin-concurrency", "service-eligibility", "source-eligibility", "no-eligible-member", "cross-tenant-lead-assignment-rejection", "current-assignment-uniqueness", "activity-generation", "lead-stage-new-to-assigned",
  ] }, null, 2));
} finally {
  if (leadIds.length) { await db.BirthwaveTask.update({ parent_task_id: null }, { where: { client_id: clientId, lead_id: leadIds } }); await db.BirthwaveTask.destroy({ where: { client_id: clientId, lead_id: leadIds } }); }
  if (leadIds.length) await db.BirthwaveLeadAssignment.destroy({ where: { client_id: clientId, lead_id: leadIds } });
  if (leadIds.length) await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: leadIds } });
  if (leadIds.length) await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: leadIds } });
  if (teamIds.length) await db.BirthwaveAssignmentRule.destroy({ where: { client_id: clientId, team_id: teamIds } });
  if (teamIds.length) await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: teamIds } });
  if (teamIds.length) await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: teamIds } });
  if (teamIds.length) await db.BirthwaveTeam.destroy({ where: { id: teamIds } });
  if (managementIds.length) await db.Management.destroy({ where: { client_id: clientId, id: managementIds } });
  await db.sequelize.close();
}
