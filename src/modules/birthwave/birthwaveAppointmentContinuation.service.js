import { Op } from "sequelize";
import db from "../../database/index.js";
import { createTaskInTransaction } from "./birthwaveTask.service.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";

const httpError = (status, message) => { const error = new Error(message); error.status = status; return error; };
const actorId = (actor) => Number.isInteger(Number(actor?.id)) && Number(actor.id) > 0 ? Number(actor.id) : null;
const scope = (clientId, extra = {}) => ({ client_id: clientId, ...extra });
const APPOINTMENT_CONFIRMATION_DUE_MINUTES = Math.max(1, Number(process.env.APPOINTMENT_CONFIRMATION_DUE_MINUTES) || 60);
const activeStatuses = ["PENDING", "IN_PROGRESS", "OVERDUE"];
const activeStages = new Set(["ASSIGNED", "CONTACTING", "CONTACTED", "QUALIFIED", "INTERESTED", "APPOINTMENT_SCHEDULED", "ATTENDED"]);
const stage = (lead) => {
  const value = String(lead.status || "NEW").toUpperCase();
  return ({ NEW_LEAD: "NEW", ASSIGNED: "ASSIGNED", CONTACTED: "CONTACTED", CONSULTATION_BOOKED: "APPOINTMENT_SCHEDULED", VISITED: "ATTENDED" })[value] || value;
};

const setStage = async ({ clientId, lead, value, actor, transaction }) => {
  const previous = stage(lead);
  if (previous === value) return;
  await lead.update({ status: value }, { transaction });
  await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "status_changed", title: "Lead stage changed", description: `${previous} → ${value}`, previousValue: previous, newValue: value, transaction });
};

const closeActiveTasks = async ({ clientId, leadId, actor, transaction, reason, exceptId = null }) => {
  const tasks = await db.BirthwaveTask.findAll({ where: scope(clientId, { lead_id: leadId, status: { [Op.in]: activeStatuses }, ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) }), transaction, lock: transaction.LOCK.UPDATE });
  for (const task of tasks) {
    await task.update({ status: "CANCELLED", is_primary: false, cancelled_at: new Date(), completion_reason: reason, updated_by: actorId(actor) }, { transaction });
    await logBirthwaveActivity({ clientId, leadId, actor, eventType: "task_cancelled", title: "Task cancelled", description: reason, newValue: String(task.id), transaction });
  }
};

const primaryTask = async (clientId, leadId, transaction) => db.BirthwaveTask.findOne({ where: scope(clientId, { lead_id: leadId, is_primary: true, status: { [Op.in]: activeStatuses } }), order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });

const createPrimaryTask = async ({ clientId, lead, appointment, taskType, dueAt, actor, transaction, createdFrom }) => {
  if (!lead.current_team_id || !lead.current_owner_id || !activeStages.has(stage(lead))) return null;
  const existing = await primaryTask(clientId, lead.id, transaction);
  if (existing) {
    await existing.update({ status: "CANCELLED", is_primary: false, cancelled_at: new Date(), completion_reason: createdFrom, updated_by: actorId(actor) }, { transaction });
    await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "task_cancelled", title: "Previous next action closed", description: createdFrom, newValue: String(existing.id), transaction });
  }
  return createTaskInTransaction({
    clientId,
    leadId: lead.id,
    teamId: lead.current_team_id,
    ownerId: lead.current_owner_id,
    taskType,
    priority: "NORMAL",
    dueAt,
    isPrimary: true,
    parentTaskId: existing?.id || null,
    attemptNumber: 1,
    createdFrom,
    metadata: { created_from: createdFrom, appointment_id: appointment.id },
    actor,
    transaction,
  });
};

export const createAppointmentContinuationInTransaction = async ({ clientId, lead, appointment, actor, transaction }) => {
  await setStage({ clientId, lead, value: "APPOINTMENT_SCHEDULED", actor, transaction });
  const task = await createPrimaryTask({ clientId, lead, appointment, taskType: "APPOINTMENT_CONFIRMATION", dueAt: new Date(Date.now() + APPOINTMENT_CONFIRMATION_DUE_MINUTES * 60 * 1000), actor, transaction, createdFrom: "APPOINTMENT_CREATED" });
  return task;
};

export const applyAppointmentStatusContinuationInTransaction = async ({ clientId, lead, appointment, previousStatus, actor, transaction, continuation = null }) => {
  const status = appointment.status;
  if (!status || status === previousStatus) return null;
  const current = await primaryTask(clientId, lead.id, transaction);
  if (status === "confirmed") {
    if (current && current.task_type === "APPOINTMENT_CONFIRMATION") {
      await current.update({ status: "COMPLETED", is_primary: false, completed_at: new Date(), completion_reason: "APPOINTMENT_CONFIRMED", updated_by: actorId(actor) }, { transaction });
      await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "task_completed", title: "Appointment confirmation task completed", description: "Appointment confirmed", newValue: String(current.id), transaction });
    }
    await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "appointment_confirmed", title: "Appointment confirmed", previousValue: previousStatus, newValue: status, transaction });
    if (activeStages.has(stage(lead))) return createPrimaryTask({ clientId, lead, appointment, taskType: "MANUAL_TASK", dueAt: appointment.scheduled_at, actor, transaction, createdFrom: "APPOINTMENT_CONFIRMED" });
  }
  if (status === "completed") {
    if (current) {
      await current.update({ status: "COMPLETED", is_primary: false, completed_at: new Date(), completion_reason: "APPOINTMENT_ATTENDED", updated_by: actorId(actor) }, { transaction });
    }
    await setStage({ clientId, lead, value: "ATTENDED", actor, transaction });
    await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "appointment_attended", title: "Appointment attended", previousValue: previousStatus, newValue: status, transaction });
    return createPrimaryTask({ clientId, lead, appointment, taskType: "MANUAL_TASK", dueAt: new Date(), actor, transaction, createdFrom: "APPOINTMENT_ATTENDED" });
  }
  if (status === "no_show") {
    if (current) {
      await current.update({ status: "COMPLETED", is_primary: false, completed_at: new Date(), completion_reason: "APPOINTMENT_NO_SHOW", updated_by: actorId(actor) }, { transaction });
    }
    await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "appointment_no_show", title: "Appointment marked no-show", previousValue: previousStatus, newValue: status, transaction });
    return createPrimaryTask({ clientId, lead, appointment, taskType: "NO_SHOW_RECOVERY", dueAt: new Date(Date.now() + APPOINTMENT_CONFIRMATION_DUE_MINUTES * 60 * 1000), actor, transaction, createdFrom: "APPOINTMENT_NO_SHOW" });
  }
  if (status === "cancelled") {
    if (!continuation?.type) throw httpError(400, "Cancelled appointments require a follow-up, retry, lost, or explicit continuation decision");
    if (current) await current.update({ status: "CANCELLED", is_primary: false, cancelled_at: new Date(), completion_reason: "APPOINTMENT_CANCELLED", updated_by: actorId(actor) }, { transaction });
    await logBirthwaveActivity({ clientId, leadId: lead.id, actor, eventType: "appointment_cancelled", title: "Appointment cancelled", previousValue: previousStatus, newValue: status, description: continuation.reason || null, transaction });
    if (continuation.type === "LOST") {
      await setStage({ clientId, lead, value: "LOST", actor, transaction });
      await closeActiveTasks({ clientId, leadId: lead.id, actor, transaction, reason: "APPOINTMENT_CANCELLED_LOST" });
      return null;
    }
    if (!["FOLLOW_UP", "RETRY_CALL"].includes(continuation.type) || !continuation.due_at) throw httpError(400, "Cancelled appointment continuation requires a valid next action and due time");
    return createPrimaryTask({ clientId, lead, appointment, taskType: continuation.type, dueAt: new Date(continuation.due_at), actor, transaction, createdFrom: "APPOINTMENT_CANCELLED" });
  }
  if (status === "scheduled") {
    await setStage({ clientId, lead, value: "APPOINTMENT_SCHEDULED", actor, transaction });
    return createPrimaryTask({ clientId, lead, appointment, taskType: "APPOINTMENT_CONFIRMATION", dueAt: new Date(Date.now() + APPOINTMENT_CONFIRMATION_DUE_MINUTES * 60 * 1000), actor, transaction, createdFrom: "APPOINTMENT_RESCHEDULED" });
  }
  return null;
};

export default { createAppointmentContinuationInTransaction, applyAppointmentStatusContinuationInTransaction };
