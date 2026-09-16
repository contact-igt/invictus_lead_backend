import assert from "node:assert/strict";
import db from "../database/index.js";
import { getOperationalDashboard } from "../modules/birthwave/birthwaveDashboard.service.js";

if (!["local", "development"].includes(process.env.INVICTUS_SERVER_LINE || "local")) throw new Error("Dashboard verification is restricted to local/development databases");
const clients = await db.Client.findAll({ order: [["id", "ASC"]], limit: 2, attributes: ["id"] }); assert.ok(clients.length >= 2, "At least two local clients are required");
const clientId = clients[0].id; const suffix = Date.now(); const management = await db.Management.create({ client_id: clientId, title: "Mr", username: `phase7-dashboard-${suffix}`, email: `phase7-dashboard-${suffix}@example.test`, mobile: `95${String(suffix).slice(-8)}`, password: "verification-only", role: "client" }); const team = await db.BirthwaveTeam.create({ client_id: clientId, name: `Phase Seven Dashboard ${suffix}`, code: `phase7_dash_${suffix}` });
const leadIds = []; const taskIds = []; const appointmentIds = [];
try {
  await db.BirthwaveTeamMember.create({ client_id: clientId, team_id: team.id, management_id: management.id, operational_role: "TELECALLER", status: "ACTIVE", assignment_enabled: true });
  // BW-FIX-006: kpis.new_leads is a STAGE count (status === "NEW"), exactly
  // like kpis.lost_leads / kpis.invalid_leads beside it — not a "created in
  // range" count. Asserting it from a single ASSIGNED lead could never pass,
  // so the NEW-stage lead below is what actually exercises that KPI. Both
  // leads are seeded in the canonical BW-FIX-002 stage vocabulary; the old
  // lowercase "assigned" seed re-introduced the legacy vocabulary this
  // fixture is supposed to be free of.
  const today = new Date();
  const newLead = await db.BirthwaveLead.create({ client_id: clientId, name: `Dashboard New Lead ${suffix}`, phone: `+9196${String(suffix).slice(-8)}`, service: "VBAC", source: "website", status: "NEW", custom_fields: {} }); leadIds.push(newLead.id);
  const lead = await db.BirthwaveLead.create({ client_id: clientId, name: `Dashboard Lead ${suffix}`, phone: `+9195${String(suffix).slice(-8)}`, service: "VBAC", source: "website", status: "ASSIGNED", current_team_id: team.id, current_owner_id: management.id, custom_fields: {} }); leadIds.push(lead.id);
  const task = await db.BirthwaveTask.create({ client_id: clientId, lead_id: lead.id, team_id: team.id, owner_id: management.id, task_type: "FOLLOW_UP", status: "PENDING", priority: "HIGH", due_at: today, is_primary: true, attempt_number: 1 }); taskIds.push(task.id);
  const appointment = await db.BirthwaveAppointment.create({ client_id: clientId, lead_id: lead.id, service: "VBAC", scheduled_at: today, status: "scheduled" }); appointmentIds.push(appointment.id);
  const dashboard = await getOperationalDashboard({ id: clientId }, { range: "today" }, { id: 0, role: "client" });
  assert.equal(dashboard.timezone, "Asia/Kolkata"); assert.ok(dashboard.kpis.new_leads >= 1); assert.ok(dashboard.kpis.tasks_due_today >= 1); assert.ok(dashboard.kpis.follow_ups_due >= 1); assert.ok(dashboard.kpis.appointments_today >= 1); assert.ok(dashboard.team_summary.some((row) => row.team.id === team.id)); assert.ok(dashboard.telecaller_summary.some((row) => row.owner.id === management.id));
  const other = await getOperationalDashboard({ id: clients[1].id }, { range: "today" }, { id: 0, role: "client" }); assert.equal(other.kpis.new_leads, 0);
  console.log(JSON.stringify({ passed: true, checks: ["today-range", "canonical-lead-counts", "task-counts", "follow-up-counts", "appointment-counts", "team-summary", "telecaller-summary", "tenant-isolation"] }, null, 2));
} finally {
  if (appointmentIds.length) await db.BirthwaveAppointment.destroy({ where: { client_id: clientId, id: appointmentIds } });
  if (taskIds.length) await db.BirthwaveTask.destroy({ where: { client_id: clientId, id: taskIds } });
  if (leadIds.length) await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: leadIds } });
  await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: team.id } }); await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: team.id } }); await db.Management.destroy({ where: { client_id: clientId, id: management.id } }); await db.sequelize.close();
}
