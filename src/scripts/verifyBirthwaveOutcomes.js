import assert from "node:assert/strict";
import db from "../database/index.js";
import { createTeam, addTeamMember } from "../modules/birthwave/birthwaveTeam.service.js";
import { assignLead } from "../modules/birthwave/birthwaveAssignment.service.js";
import { startTask } from "../modules/birthwave/birthwaveTask.service.js";
import { recordTaskOutcome } from "../modules/birthwave/birthwaveOutcome.service.js";
import { updateAppointment } from "../modules/birthwave/birthwave.service.js";

if (!['local', 'development'].includes(process.env.INVICTUS_SERVER_LINE || 'local')) throw new Error('Outcome verification is restricted to local/development databases');
const clients = await db.Client.findAll({ order: [['id', 'ASC']], limit: 2, attributes: ['id'] });
assert.ok(clients.length >= 2, 'At least two local clients are required');
const clientId = clients[0].id;
const otherClientId = clients[1].id;
const tenant = { id: clientId };
const suffix = Date.now();
const actor = { id: 0, role: 'client', username: 'Phase Six Verification' };
const managementIds = [];
const teamIds = [];
const leadIds = [];
const due = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

const createManagement = async (number) => {
  const row = await db.Management.create({ client_id: clientId, title: 'Mr', username: `phase6-user-${suffix}-${number}`, email: `phase6-user-${suffix}-${number}@example.test`, mobile: `92000${String(suffix).slice(-5)}${number}`.slice(-10), password: 'not-a-real-login-password', role: 'client' });
  managementIds.push(row.id);
  return row;
};
const createLead = async (name, client = clientId) => {
  const row = await db.BirthwaveLead.create({ client_id: client, name, phone: `+9193${String(suffix).slice(-8)}${leadIds.length + 1}`.slice(0, 13), service: 'VBAC', source: 'website', status: 'new_lead', custom_fields: {} });
  if (client === clientId) leadIds.push(row.id);
  return row;
};

try {
  const user = await createManagement(1);
  const team = await createTeam(tenant, { name: `Phase Six Team ${suffix}`, code: `phase6_${suffix}` }, actor);
  teamIds.push(team.id);
  await addTeamMember(tenant, team.id, { management_id: user.id, operational_role: 'TELECALLER' }, actor);
  const owner = { id: user.id, role: 'telecaller', username: user.username };

  const lead = await createLead(`Outcome Lead ${suffix}`);
  const assigned = await assignLead({ tenant, leadId: lead.id, teamId: team.id, ownerId: user.id, actor });
  await startTask(tenant, assigned.task.id, owner);
  const notReached = await recordTaskOutcome(tenant, assigned.task.id, { outcome_event_id: `phase6-no-answer-${suffix}`, contact_result: 'NOT_REACHED', not_reached_reason: 'NO_ANSWER', next_action_due_at: due(30), notes: 'No answer on first attempt' }, owner);
  assert.equal(notReached.outcome.evidence_source, 'MANUAL_TASK');
  assert.equal(notReached.outcome.disposition, null);
  assert.equal(notReached.next_task.task_type, 'RETRY_CALL');
  const duplicate = await recordTaskOutcome(tenant, assigned.task.id, { outcome_event_id: `phase6-no-answer-${suffix}`, contact_result: 'NOT_REACHED', not_reached_reason: 'BUSY', next_action_due_at: due(45) }, owner);
  assert.equal(duplicate.duplicate, true, 'Duplicate outcome event is idempotent');

  await startTask(tenant, notReached.next_task.id, owner);
  const interested = await recordTaskOutcome(tenant, notReached.next_task.id, { outcome_event_id: `phase6-followup-${suffix}`, contact_result: 'CONNECTED', disposition: 'FOLLOW_UP_REQUIRED', next_action_due_at: due(90), notes: 'Customer requested a follow-up' }, owner);
  assert.equal(interested.next_task.task_type, 'FOLLOW_UP');
  assert.equal((await db.BirthwaveLead.findByPk(lead.id)).status, 'CONTACTED');

  await startTask(tenant, interested.next_task.id, owner);
  const lost = await recordTaskOutcome(tenant, interested.next_task.id, { outcome_event_id: `phase6-lost-${suffix}`, contact_result: 'CONNECTED', disposition: 'NOT_INTERESTED', lost_reason: 'PRICE', notes: 'Price objection' }, owner);
  assert.equal(lost.next_task, null);
  assert.equal((await db.BirthwaveLead.findByPk(lead.id)).status, 'LOST');
  assert.equal(await db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: lead.id, status: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } }), 0);

  const appointmentLead = await createLead(`Appointment Lead ${suffix}`);
  const appointmentAssignment = await assignLead({ tenant, leadId: appointmentLead.id, teamId: team.id, ownerId: user.id, actor });
  await startTask(tenant, appointmentAssignment.task.id, owner);
  const appointmentOutcome = await recordTaskOutcome(tenant, appointmentAssignment.task.id, { outcome_event_id: `phase6-appointment-${suffix}`, contact_result: 'CONNECTED', disposition: 'APPOINTMENT_REQUIRED', appointment: { scheduled_at: due(180), service: 'VBAC', notes: 'Initial consultation' } }, owner);
  assert.equal(appointmentOutcome.appointment.status, 'scheduled');
  assert.equal(appointmentOutcome.next_task.task_type, 'APPOINTMENT_CONFIRMATION');
  const confirmed = await updateAppointment(tenant, appointmentOutcome.appointment.id, { status: 'confirmed' }, actor);
  assert.equal(confirmed.status, 'confirmed');
  const noShow = await updateAppointment(tenant, appointmentOutcome.appointment.id, { status: 'no_show' }, actor);
  assert.equal(noShow.status, 'no_show');
  assert.equal(await db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: appointmentLead.id, task_type: 'NO_SHOW_RECOVERY', status: ['PENDING', 'IN_PROGRESS', 'OVERDUE'], is_primary: true } }), 1);

  const attendedLead = await createLead(`Attended Lead ${suffix}`);
  const attendedAssignment = await assignLead({ tenant, leadId: attendedLead.id, teamId: team.id, ownerId: user.id, actor });
  await startTask(tenant, attendedAssignment.task.id, owner);
  const attendedOutcome = await recordTaskOutcome(tenant, attendedAssignment.task.id, { outcome_event_id: `phase6-attended-${suffix}`, contact_result: 'CONNECTED', disposition: 'APPOINTMENT_REQUIRED', appointment: { scheduled_at: due(210), service: 'VBAC' } }, owner);
  const attendedAppointment = await updateAppointment(tenant, attendedOutcome.appointment.id, { status: 'completed' }, actor);
  assert.equal(attendedAppointment.status, 'completed');
  assert.equal((await db.BirthwaveLead.findByPk(attendedLead.id)).status, 'ATTENDED');

  const cancelledLead = await createLead(`Cancelled Lead ${suffix}`);
  const cancelledAssignment = await assignLead({ tenant, leadId: cancelledLead.id, teamId: team.id, ownerId: user.id, actor });
  await startTask(tenant, cancelledAssignment.task.id, owner);
  const cancelledOutcome = await recordTaskOutcome(tenant, cancelledAssignment.task.id, { outcome_event_id: `phase6-cancelled-${suffix}`, contact_result: 'CONNECTED', disposition: 'APPOINTMENT_REQUIRED', appointment: { scheduled_at: due(240), service: 'VBAC' } }, owner);
  await updateAppointment(tenant, cancelledOutcome.appointment.id, { status: 'cancelled', continuation: { type: 'FOLLOW_UP', due_at: due(300), reason: 'Customer will choose another date' } }, actor);
  assert.equal(await db.BirthwaveTask.count({ where: { client_id: clientId, lead_id: cancelledLead.id, task_type: 'FOLLOW_UP', status: ['PENDING', 'IN_PROGRESS', 'OVERDUE'], is_primary: true } }), 1);

  await assert.rejects(() => recordTaskOutcome({ id: otherClientId }, assigned.task.id, { outcome_event_id: `phase6-cross-${suffix}`, contact_result: 'NOT_REACHED', not_reached_reason: 'NO_ANSWER', next_action_due_at: due(30) }, actor), (error) => error.status === 404);

  console.log(JSON.stringify({ passed: true, checks: ['manual-evidence', 'not-reached-retry', 'connected-follow-up', 'lost-closure', 'outcome-idempotency', 'appointment-continuation', 'tenant-isolation'] }, null, 2));
} finally {
  if (leadIds.length) {
    await db.BirthwaveDisposition.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveTask.update({ parent_task_id: null }, { where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveTask.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveAppointment.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveLeadAssignment.destroy({ where: { client_id: clientId, lead_id: leadIds } });
    await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: leadIds } });
  }
  if (teamIds.length) {
    await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: teamIds } });
    await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: teamIds } });
    await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: teamIds } });
  }
  if (managementIds.length) await db.Management.destroy({ where: { client_id: clientId, id: managementIds } });
  await db.sequelize.close();
}
