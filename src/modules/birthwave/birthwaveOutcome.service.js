import { Op } from "sequelize";
import db from "../../database/index.js";
import {
  BIRTHWAVE_CONTACT_RESULTS,
  BIRTHWAVE_DISPOSITIONS,
  BIRTHWAVE_LOST_REASONS,
  BIRTHWAVE_NEXT_ACTION_TYPES,
  BIRTHWAVE_NOT_REACHED_REASONS,
} from "../../database/tables/BirthwaveDispositionTable/index.js";
import { assertCanViewLead } from "./birthwavePermissions.service.js";
import { assertCanMutateTask, createTaskInTransaction } from "./birthwaveTask.service.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";

const httpError = (status, message) => { const error = new Error(message); error.status = status; return error; };
const actorId = (actor) => Number.isInteger(Number(actor?.id)) && Number(actor.id) > 0 ? Number(actor.id) : null;
const scope = (clientId, extra = {}) => ({ client_id: clientId, ...extra });
const ACTIVE_LEAD_STAGES = new Set(["ASSIGNED", "CONTACTING", "CONTACTED", "QUALIFIED", "INTERESTED", "APPOINTMENT_SCHEDULED", "ATTENDED"]);
const CALL_TASK_TYPES = new Set(["INITIAL_CALL", "RETRY_CALL", "FOLLOW_UP"]);
const ACTIVE_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "OVERDUE"];
const APPOINTMENT_CONFIRMATION_DUE_MINUTES = Math.max(1, Number(process.env.APPOINTMENT_CONFIRMATION_DUE_MINUTES) || 60);

const leadStage = (lead) => {
  const value = String(lead?.status || "NEW").toUpperCase();
  return ({ NEW_LEAD: "NEW", ASSIGNED: "ASSIGNED", CONTACTED: "CONTACTED", CONSULTATION_BOOKED: "APPOINTMENT_SCHEDULED", VISITED: "ATTENDED" })[value] || value;
};
const isActiveLead = (lead) => ACTIVE_LEAD_STAGES.has(leadStage(lead));
const transactionRunner = async (callback) => {
  const transaction = await db.sequelize.transaction();
  try { const result = await callback(transaction); await transaction.commit(); return result; } catch (error) { await transaction.rollback(); throw error; }
};

const serializeOutcome = (row) => ({
  id: row.id,
  outcome_event_id: row.outcome_event_id,
  client_id: row.client_id,
  lead_id: row.lead_id,
  task_id: row.task_id,
  call_id: row.call_id ?? null,
  evidence_source: row.evidence_source,
  contact_result: row.contact_result,
  not_reached_reason: row.not_reached_reason ?? null,
  disposition: row.disposition ?? null,
  notes: row.notes ?? null,
  next_action_type: row.next_action_type ?? null,
  next_action_due_at: row.next_action_due_at ?? null,
  appointment_id: row.appointment_id ?? null,
  lost_reason: row.lost_reason ?? null,
  created_by: row.created_by ?? null,
  created_at: row.created_at,
});

const setLeadStage = async ({ lead, nextStage, actor, clientId, transaction }) => {
  const previous = leadStage(lead);
  if (previous === nextStage) return false;
  await lead.update({ status: nextStage }, { transaction });
  await logBirthwaveActivity({
    clientId,
    leadId: lead.id,
    actor,
    eventType: "status_changed",
    title: "Lead stage changed",
    description: `${previous} → ${nextStage}`,
    previousValue: previous,
    newValue: nextStage,
    transaction,
  });
  return true;
};

const validateOutcome = ({ data, task, lead }) => {
  if (!data.outcome_event_id || String(data.outcome_event_id).trim().length > 191) throw httpError(400, "outcome_event_id is required");
  if (!BIRTHWAVE_CONTACT_RESULTS.includes(data.contact_result)) throw httpError(400, "Invalid contact_result");
  if (!CALL_TASK_TYPES.has(task.task_type)) throw httpError(400, "Only call and follow-up Tasks can record an outcome");
  if (!ACTIVE_LEAD_STAGES.has(leadStage(lead))) throw httpError(400, "Terminal Leads cannot record an outcome");
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";
  if (data.contact_result === "NOT_REACHED") {
    if (!BIRTHWAVE_NOT_REACHED_REASONS.includes(data.not_reached_reason)) throw httpError(400, "A valid not-reached reason is required");
    if (!data.next_action_due_at) throw httpError(400, "A retry date and time is required for a not-reached outcome");
    if (data.disposition) throw httpError(400, "Not-reached outcomes cannot include a business disposition");
    return { notes, nextActionType: "RETRY_CALL", dueAt: new Date(data.next_action_due_at), nextStage: leadStage(lead) === "ASSIGNED" ? "CONTACTING" : null };
  }
  if (!BIRTHWAVE_DISPOSITIONS.includes(data.disposition)) throw httpError(400, "A business disposition is required when the customer is connected");
  if (["NOT_INTERESTED"].includes(data.disposition) && !BIRTHWAVE_LOST_REASONS.includes(data.lost_reason)) throw httpError(400, "A valid lost reason is required");
  if (["WRONG_NUMBER", "INVALID_LEAD"].includes(data.disposition) && !String(data.lost_reason || "").trim()) throw httpError(400, "A reason is required for this invalid outcome");
  if (data.disposition === "FOLLOW_UP_REQUIRED" || data.disposition === "CALL_LATER") {
    if (!data.next_action_due_at) throw httpError(400, "A next-action date and time is required");
  }
  if (data.disposition === "INTERESTED" && !["FOLLOW_UP", "APPOINTMENT"].includes(data.next_action_type)) throw httpError(400, "Interested outcomes require a follow-up or appointment next action");
  if (data.disposition === "OTHER" && !["FOLLOW_UP", "RETRY_CALL", "MANUAL_TASK"].includes(data.next_action_type)) throw httpError(400, "Other outcomes require an explicit next action");
  const needsDue = ["INTERESTED", "FOLLOW_UP_REQUIRED", "CALL_LATER", "OTHER"].includes(data.disposition) && data.next_action_type !== "APPOINTMENT";
  if (needsDue && !data.next_action_due_at) throw httpError(400, "A due date and time is required for the next action");
  if (data.disposition === "OTHER" && !notes) throw httpError(400, "Notes are required for an Other disposition");
  const dueAt = data.next_action_due_at ? new Date(data.next_action_due_at) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw httpError(400, "A valid next-action date and time is required");
  const nextActionType = data.disposition === "FOLLOW_UP_REQUIRED"
    ? "FOLLOW_UP"
    : data.disposition === "CALL_LATER"
      ? "RETRY_CALL"
      : data.disposition === "APPOINTMENT_REQUIRED"
        ? "APPOINTMENT"
        : data.next_action_type || null;
  if (data.disposition === "APPOINTMENT_REQUIRED" || (data.disposition === "INTERESTED" && data.next_action_type === "APPOINTMENT")) {
    const appointment = data.appointment;
    if (!appointment || !appointment.scheduled_at) throw httpError(400, "Appointment date and time is required");
    const appointmentDate = new Date(appointment.scheduled_at);
    if (Number.isNaN(appointmentDate.getTime())) throw httpError(400, "A valid appointment date and time is required");
    return { notes, nextActionType, dueAt: appointmentDate, appointment, nextStage: "APPOINTMENT_SCHEDULED" };
  }
  if (data.disposition === "NOT_INTERESTED") return { notes, nextActionType: null, dueAt: null, nextStage: "LOST" };
  if (data.disposition === "WRONG_NUMBER" || data.disposition === "INVALID_LEAD") return { notes, nextActionType: null, dueAt: null, nextStage: "INVALID" };
  const nextStage = data.disposition === "INTERESTED" ? "INTERESTED" : (leadStage(lead) === "ASSIGNED" || leadStage(lead) === "CONTACTING" ? "CONTACTED" : null);
  return { notes, nextActionType, dueAt, nextStage };
};

const createAppointmentInTransaction = async ({ clientId, lead, appointment, actor, transaction }) => {
  const doctorId = appointment.doctor_id ? Number(appointment.doctor_id) : null;
  if (doctorId) {
    const doctor = await db.BirthwaveDoctor.findOne({ where: scope(clientId, { id: doctorId }), transaction });
    if (!doctor || !doctor.active) throw httpError(400, "Appointment doctor does not belong to this client or is inactive");
  }
  const row = await db.BirthwaveAppointment.create({
    client_id: clientId,
    lead_id: lead.id,
    doctor_id: doctorId,
    service: appointment.service || lead.service || null,
    scheduled_at: new Date(appointment.scheduled_at),
    status: "scheduled",
    notes: appointment.notes || null,
  }, { transaction });
  await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "appointment_created", title: "Appointment created", description: `Appointment scheduled for ${row.scheduled_at.toISOString()}`, newValue: String(row.id), transaction });
  return row;
};

const cancelRemainingTasks = async ({ clientId, leadId, actor, transaction, reason }) => {
  const rows = await db.BirthwaveTask.findAll({ where: scope(clientId, { lead_id: leadId, status: { [Op.in]: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }), transaction, lock: transaction.LOCK.UPDATE });
  for (const row of rows) {
    await row.update({ status: "CANCELLED", is_primary: false, cancelled_at: new Date(), completion_reason: reason, updated_by: actorId(actor) }, { transaction });
    await logBirthwaveActivity({ clientId, leadId, actor, eventType: "task_cancelled", title: "Task cancelled", description: reason, newValue: String(row.id), transaction });
  }
};

const createSuccessorTask = async ({ clientId, task, lead, nextActionType, dueAt, actor, transaction, outcomeEventId, appointmentId = null }) => {
  if (!nextActionType || !dueAt) return null;
  const taskType = nextActionType === "FOLLOW_UP" ? "FOLLOW_UP" : nextActionType === "RETRY_CALL" ? "RETRY_CALL" : nextActionType === "APPOINTMENT" ? "APPOINTMENT_CONFIRMATION" : "MANUAL_TASK";
  return createTaskInTransaction({
    clientId,
    leadId: lead.id,
    teamId: task.team_id,
    ownerId: task.owner_id,
    taskType,
    priority: task.priority,
    dueAt,
    isPrimary: true,
    parentTaskId: task.id,
    attemptNumber: taskType === "RETRY_CALL" ? task.attempt_number + 1 : 1,
    createdFrom: "OUTCOME",
    metadata: { created_from: "OUTCOME", outcome_event_id: outcomeEventId, evidence_source: "MANUAL_TASK", appointment_id: appointmentId },
    actor,
    transaction,
  });
};

export const getDispositionOptions = () => ({
  evidence_sources: ["MANUAL_TASK"],
  contact_results: BIRTHWAVE_CONTACT_RESULTS,
  not_reached_reasons: BIRTHWAVE_NOT_REACHED_REASONS,
  dispositions: BIRTHWAVE_DISPOSITIONS,
  next_action_types: BIRTHWAVE_NEXT_ACTION_TYPES,
  lost_reasons: BIRTHWAVE_LOST_REASONS,
});

export const recordTaskOutcome = async (tenant, taskId, data, actor) => transactionRunner(async (transaction) => {
  const clientId = Number(tenant.id);
  const existingBeforeLock = await db.BirthwaveDisposition.findOne({ where: scope(clientId, { outcome_event_id: data.outcome_event_id }) });
  if (existingBeforeLock) return { duplicate: true, outcome: serializeOutcome(existingBeforeLock), next_task: null, appointment: null };
  const task = await db.BirthwaveTask.findOne({ where: scope(clientId, { id: taskId }), transaction, lock: transaction.LOCK.UPDATE });
  if (!task) throw httpError(404, "Task not found");
  await assertCanMutateTask(clientId, task, actor);
  const existingAfterLock = await db.BirthwaveDisposition.findOne({ where: scope(clientId, { outcome_event_id: data.outcome_event_id }), transaction, lock: transaction.LOCK.UPDATE });
  if (existingAfterLock) return { duplicate: true, outcome: serializeOutcome(existingAfterLock), next_task: null, appointment: null };
  if (!task.is_primary || !ACTIVE_TASK_STATUSES.includes(task.status)) throw httpError(409, "Only the active Primary Task can record an outcome");
  const lead = await db.BirthwaveLead.findOne({ where: scope(clientId, { id: task.lead_id }), transaction, lock: transaction.LOCK.UPDATE });
  if (!lead) throw httpError(404, "Lead not found");
  const outcome = validateOutcome({ data, task, lead });
  const currentStage = leadStage(lead);
  const targetStage = outcome.nextStage || (data.contact_result === "CONNECTED" && ["ASSIGNED", "CONTACTING"].includes(currentStage) ? "CONTACTED" : null);
  if (targetStage) await setLeadStage({ lead, nextStage: targetStage, actor, clientId, transaction });
  const appointment = outcome.appointment ? await createAppointmentInTransaction({ clientId, lead, appointment: outcome.appointment, actor, transaction }) : null;
  const effectiveNextActionType = outcome.nextActionType;
  const effectiveDueAt = outcome.dueAt;
  await task.update({ status: "COMPLETED", is_primary: false, completed_at: new Date(), completion_reason: `OUTCOME:${data.contact_result}:${data.disposition || data.not_reached_reason}`, updated_by: actorId(actor) }, { transaction });
  await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "task_completed", title: "Outcome Task completed", description: `${task.task_type} recorded ${data.contact_result}`, newValue: String(task.id), transaction });
  await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "contact_attempt_recorded", title: "Contact attempt recorded", description: `Manual task evidence · ${data.contact_result}`, newValue: String(task.id), transaction });
  if (data.contact_result === "CONNECTED") await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "customer_connected", title: "Customer connected", description: data.notes || "Customer connected during manual task", transaction });
  else await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "customer_not_reached", title: "Customer not reached", description: data.not_reached_reason, transaction });
  if (data.disposition) await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "disposition_recorded", title: "Business disposition recorded", description: data.disposition, newValue: data.disposition, transaction });
  let nextTask = null;
  if (targetStage === "LOST" || targetStage === "INVALID") {
    await cancelRemainingTasks({ clientId, leadId: lead.id, actor, transaction, reason: targetStage === "LOST" ? "LEAD_LOST" : "LEAD_INVALID" });
    await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: targetStage === "LOST" ? "lead_lost" : "lead_invalid", title: targetStage === "LOST" ? "Lead marked lost" : "Lead marked invalid", description: data.lost_reason || data.notes, transaction });
  } else {
    nextTask = await createSuccessorTask({ clientId, task, lead, nextActionType: effectiveNextActionType, dueAt: effectiveDueAt, actor, transaction, outcomeEventId: data.outcome_event_id, appointmentId: appointment?.id ?? null });
    if (nextTask) await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: nextTask.task_type === "FOLLOW_UP" ? "follow_up_created" : nextTask.task_type === "RETRY_CALL" ? "retry_created" : "task_created", title: "Next action created", description: `${nextTask.task_type} is now the Primary Next Action`, newValue: String(nextTask.id), transaction });
  }
  const dispositionRow = await db.BirthwaveDisposition.create({
    client_id: clientId,
    lead_id: lead.id,
    task_id: task.id,
    evidence_source: "MANUAL_TASK",
    contact_result: data.contact_result,
    not_reached_reason: data.not_reached_reason || null,
    disposition: data.disposition || null,
    notes: outcome.notes || null,
    next_action_type: effectiveNextActionType || null,
    next_action_due_at: effectiveDueAt || null,
    appointment_id: appointment?.id ?? null,
    lost_reason: data.lost_reason || null,
    outcome_event_id: String(data.outcome_event_id).trim(),
    created_by: actorId(actor),
  }, { transaction });
  return { duplicate: false, outcome: serializeOutcome(dispositionRow), next_task: nextTask ? { id: nextTask.id, task_type: nextTask.task_type, due_at: nextTask.due_at, is_primary: true } : null, appointment: appointment ? { id: appointment.id, scheduled_at: appointment.scheduled_at, status: appointment.status } : null, lead_stage: leadStage(lead) };
});

export const listLeadOutcomes = async (tenant, leadId, actor) => {
  const lead = await db.BirthwaveLead.findOne({ where: scope(tenant.id, { id: leadId }) });
  if (!lead) throw httpError(404, "Lead not found");
  await assertCanViewLead(tenant.id, lead, actor);
  const rows = await db.BirthwaveDisposition.findAll({ where: scope(tenant.id, { lead_id: leadId }), order: [["created_at", "DESC"], ["id", "DESC"]], include: [{ model: db.BirthwaveTask, as: "task", required: false }] });
  return rows.map((row) => ({ ...serializeOutcome(row), task_type: row.task?.task_type || null }));
};

export default { getDispositionOptions, recordTaskOutcome, listLeadOutcomes };
