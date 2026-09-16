import { Op } from "sequelize";
import db from "../../database/index.js";
import {
  BIRTHWAVE_TASK_PRIORITIES,
  BIRTHWAVE_TASK_STATUSES,
  BIRTHWAVE_TASK_TYPES,
} from "../../database/tables/BirthwaveTaskTable/index.js";
import { LEGACY_STATUS_TO_STAGE } from "../../database/tables/BirthwaveLeadTable/index.js";
import { getOperationalScope, isTenantAdmin } from "./birthwavePermissions.service.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";

const httpError = (status, message) => { const error = new Error(message); error.status = status; return error; };
const scope = (clientId, extra = {}) => ({ client_id: clientId, ...extra });
const ACTIVE_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "OVERDUE"];
const TERMINAL_TASK_STATUSES = ["COMPLETED", "RESCHEDULED", "CANCELLED"];
const ACTIVE_LEAD_STAGES = new Set(["ASSIGNED", "CONTACTING", "CONTACTED", "QUALIFIED", "INTERESTED", "APPOINTMENT_SCHEDULED", "ATTENDED"]);
const TEMPORARY_INITIAL_CALL_DUE_MINUTES = Math.max(1, Number(process.env.INITIAL_CALL_DUE_MINUTES) || 60);

const actorId = (actor) => Number.isInteger(Number(actor?.id)) && Number(actor.id) > 0 ? Number(actor.id) : null;
const leadStage = (lead) => LEGACY_STATUS_TO_STAGE[lead.status] || String(lead.status || "NEW").toUpperCase();
const activeLead = (lead) => ACTIVE_LEAD_STAGES.has(leadStage(lead));
const activePrimaryWhere = { is_primary: true, status: { [Op.in]: ACTIVE_TASK_STATUSES } };

const managementSummary = (row) => row ? ({ id: row.id, username: row.username, email: row.email, role: row.role }) : null;
const teamSummary = (row) => row ? ({ id: row.id, name: row.name, code: row.code }) : null;

export const serializeTask = (row) => ({
  id: row.id,
  client_id: row.client_id,
  lead_id: row.lead_id,
  team_id: row.team_id,
  team: teamSummary(row.team),
  owner_id: row.owner_id,
  owner: managementSummary(row.owner),
  task_type: row.task_type,
  status: row.status,
  priority: row.priority,
  due_at: row.due_at,
  started_at: row.started_at,
  completed_at: row.completed_at,
  cancelled_at: row.cancelled_at,
  is_primary: Boolean(row.is_primary),
  is_primary_active: Boolean(row.is_primary && ACTIVE_TASK_STATUSES.includes(row.status)),
  parent_task_id: row.parent_task_id ?? null,
  attempt_number: row.attempt_number,
  completion_reason: row.completion_reason ?? null,
  metadata: row.metadata ?? null,
  created_by: row.created_by ?? null,
  updated_by: row.updated_by ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  lead: row.lead ? { id: row.lead.id, name: row.lead.name, phone: row.lead.phone, service: row.lead.service, stage: leadStage(row.lead) } : null,
  contact: row.lead?.contact ? {
    id: row.lead.contact.id,
    display_name: row.lead.contact.display_name,
    normalized_phone: row.lead.contact.normalized_phone,
    normalized_email: row.lead.contact.normalized_email,
  } : null,
});

const taskInclude = [
  { model: db.BirthwaveLead, as: "lead", required: true, include: [{ model: db.BirthwaveContact, as: "contact", required: false }] },
  { model: db.BirthwaveTeam, as: "team", required: true },
  { model: db.Management, as: "owner", required: true },
];

const getLeadForTenant = async (clientId, leadId, transaction, lock = false) => {
  const row = await db.BirthwaveLead.findOne({ where: scope(clientId, { id: leadId }), ...(transaction ? { transaction } : {}), ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!row) throw httpError(404, "Lead not found");
  return row;
};

const getTaskForTenant = async (clientId, taskId, transaction, lock = false) => {
  const row = await db.BirthwaveTask.findOne({ where: scope(clientId, { id: taskId }), ...(transaction ? { transaction } : {}), ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!row) throw httpError(404, "Task not found");
  return row;
};

const getPrimaryTask = async (clientId, leadId, transaction, lock = false) => db.BirthwaveTask.findOne({
  where: scope(clientId, { lead_id: leadId, ...activePrimaryWhere }),
  order: [["id", "ASC"]],
  ...(transaction ? { transaction } : {}),
  ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
});

const validateTaskOwner = async (clientId, lead, teamId, ownerId, transaction) => {
  const team = await db.BirthwaveTeam.findOne({ where: scope(clientId, { id: teamId }), ...(transaction ? { transaction } : {}) });
  if (!team) throw httpError(404, "Team not found");
  if (!team.is_active) throw httpError(400, "Team is inactive");
  const member = await db.BirthwaveTeamMember.findOne({
    where: scope(clientId, { team_id: team.id, management_id: ownerId }),
    include: [{ model: db.Management, as: "management", required: true, attributes: ["id", "username", "email", "role"] }],
    ...(transaction ? { transaction } : {}),
  });
  if (!member) throw httpError(400, "Task owner is not a member of this Team");
  if (member.status !== "ACTIVE" || !member.assignment_enabled) throw httpError(400, "Task owner is not eligible for assignment");
  if (!["TEAM_MANAGER", "TELECALLER"].includes(member.operational_role)) throw httpError(400, "Task owner does not have an eligible operational role");
  const list = (value) => Array.isArray(value) ? value : (typeof value === "string" ? (() => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })() : []);
  // BW-SVC-001: service_access entries may be a service name or its slug, and a
  // Lead's stored `service` text can be stale after a rename — so match against
  // the service master's current name and slug as well.
  const serviceRow = lead.service_id
    ? await db.BirthwaveService.findOne({ where: { client_id: lead.client_id, id: lead.service_id }, ...(transaction ? { transaction } : {}) })
    : null;
  const allowedServices = list(member.service_access).map((entry) => String(entry).trim().toLowerCase());
  const leadServiceNames = new Set(
    [serviceRow?.name, serviceRow?.slug, lead.service].filter(Boolean).map((value) => String(value).trim().toLowerCase()),
  );
  if (allowedServices.length && !allowedServices.some((entry) => leadServiceNames.has(entry))) throw httpError(400, "Task owner is not eligible for this Lead service");
  if (list(member.source_access).length && !list(member.source_access).includes(lead.source)) throw httpError(400, "Task owner is not eligible for this Lead source");
  return { team, member };
};

const validDueAt = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, "A valid task due_at is required");
  return date;
};

const logTaskEvent = async ({ clientId, leadId, actor, eventType, title, description, task, transaction }) => logBirthwaveActivity({
  clientId,
  leadId,
  actor,
  eventType,
  title,
  description,
  newValue: task?.id ?? null,
  transaction,
});

export const createTaskInTransaction = async ({ clientId, leadId, teamId, ownerId, taskType, status = "PENDING", priority = "NORMAL", dueAt, isPrimary = false, parentTaskId = null, attemptNumber = 1, completionReason = null, metadata = null, createdFrom = "MANUAL", actor, transaction }) => {
  if (!BIRTHWAVE_TASK_TYPES.includes(taskType)) throw httpError(400, "Invalid task type");
  if (status !== "PENDING") throw httpError(400, "New tasks must start in PENDING status");
  if (!BIRTHWAVE_TASK_PRIORITIES.includes(priority)) throw httpError(400, "Invalid task priority");
  const lead = await getLeadForTenant(clientId, leadId, transaction, true);
  const { team, member } = await validateTaskOwner(clientId, lead, teamId, ownerId, transaction);
  if (isPrimary && !activeLead(lead)) throw httpError(400, "Terminal Leads cannot have a Primary Task");
  if (isPrimary) {
    const currentPrimary = await getPrimaryTask(clientId, lead.id, transaction, true);
    if (currentPrimary) throw httpError(409, "Lead already has an active Primary Task");
  }
  const task = await db.BirthwaveTask.create({
    client_id: clientId,
    lead_id: lead.id,
    team_id: team.id,
    owner_id: member.management_id,
    task_type: taskType,
    status,
    priority,
    due_at: validDueAt(dueAt),
    is_primary: Boolean(isPrimary),
    parent_task_id: parentTaskId || null,
    attempt_number: Math.max(1, Number(attemptNumber) || 1),
    completion_reason: completionReason || null,
    metadata: metadata || { created_from: createdFrom },
    created_by: actorId(actor),
    updated_by: actorId(actor),
  }, { transaction });
  await logTaskEvent({
    clientId,
    leadId: lead.id,
    actor,
    eventType: "task_created",
    title: "Task created",
    description: `${taskType.replaceAll("_", " ")} assigned to ${member.management?.username || member.management_id} · Due ${task.due_at.toISOString()}`,
    task,
    transaction,
  });
  if (isPrimary) {
    await logTaskEvent({ clientId, leadId: lead.id, actor, eventType: "primary_task_changed", title: "Primary next action set", description: `${taskType.replaceAll("_", " ")} is the Primary Next Action`, task, transaction });
  }
  return task;
};

export const createInitialCallTaskInTransaction = async ({ clientId, lead, teamId, ownerId, actor, transaction, createdFrom = "ASSIGNMENT", dueAt = null }) => createTaskInTransaction({
  clientId,
  leadId: lead.id,
  teamId,
  ownerId,
  taskType: "INITIAL_CALL",
  priority: "NORMAL",
  dueAt: dueAt || new Date(Date.now() + TEMPORARY_INITIAL_CALL_DUE_MINUTES * 60 * 1000),
  isPrimary: true,
  createdFrom,
  actor,
  transaction,
});

export const ensurePrimaryTaskForAssignmentInTransaction = async ({ clientId, lead, teamId, ownerId, actor, transaction, reassigned }) => {
  if (!activeLead(lead)) throw httpError(400, "Only active operational Leads can receive Tasks");
  const currentPrimary = await getPrimaryTask(clientId, lead.id, transaction, true);
  if (!currentPrimary) return createInitialCallTaskInTransaction({ clientId, lead, teamId, ownerId, actor, transaction, createdFrom: reassigned ? "REASSIGNMENT" : "ASSIGNMENT" });

  await currentPrimary.update({ status: "CANCELLED", is_primary: false, cancelled_at: new Date(), completion_reason: "REASSIGNED", updated_by: actorId(actor) }, { transaction });
  await logTaskEvent({ clientId, leadId: lead.id, actor, eventType: "task_cancelled", title: "Previous task closed", description: "Primary task closed because the Lead was reassigned", task: currentPrimary, transaction });
  return createTaskInTransaction({
    clientId,
    leadId: lead.id,
    teamId,
    ownerId,
    taskType: currentPrimary.task_type,
    priority: currentPrimary.priority,
    dueAt: currentPrimary.due_at,
    isPrimary: true,
    parentTaskId: currentPrimary.id,
    attemptNumber: currentPrimary.attempt_number,
    createdFrom: "REASSIGNMENT",
    actor,
    transaction,
  });
};

const assertCanViewTask = async (tenantId, task, actor) => {
  if (isTenantAdmin(actor)) return;
  const scopeResult = await getOperationalScope(tenantId, actor);
  if (scopeResult.ownerOnly) {
    if (Number(task.owner_id) !== Number(actor?.id)) throw httpError(403, "You do not have access to this Task");
  } else if (!scopeResult.teamIds.includes(Number(task.team_id))) {
    throw httpError(403, "You do not have access to this Task");
  }
};

export const assertCanMutateTask = async (tenantId, task, actor) => {
  if (isTenantAdmin(actor)) return;
  const scopeResult = await getOperationalScope(tenantId, actor);
  const manager = !scopeResult.ownerOnly && scopeResult.teamIds.includes(Number(task.team_id));
  const owner = Number(task.owner_id) === Number(actor?.id);
  if (!manager && !owner) throw httpError(403, "You can only manage your authorized Tasks");
};

const assertCanCreateManualTask = async (tenantId, teamId, actor) => {
  if (isTenantAdmin(actor)) return;
  const membership = await db.BirthwaveTeamMember.findOne({ where: scope(tenantId, { team_id: teamId, management_id: actor?.id, operational_role: "TEAM_MANAGER", status: "ACTIVE" }) });
  if (!membership) throw httpError(403, "Only a Team Manager can create a Team Manual Task");
};

const runTransaction = async (callback) => {
  const transaction = await db.sequelize.transaction();
  try { const result = await callback(transaction); await transaction.commit(); return result; } catch (error) { await transaction.rollback(); throw error; }
};

const taskResult = async (clientId, taskId) => {
  const row = await db.BirthwaveTask.findOne({ where: scope(clientId, { id: taskId }), include: taskInclude });
  return row ? serializeTask(row) : null;
};

export const listTasks = async (tenant, query = {}, actor) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const where = scope(tenant.id);
  if (query.status) where.status = query.status;
  if (query.task_type) where.task_type = query.task_type;
  if (query.priority) where.priority = query.priority;
  if (query.lead_id) where.lead_id = Number(query.lead_id);
  if (query.owner_id) where.owner_id = Number(query.owner_id);
  if (query.team_id) where.team_id = Number(query.team_id);
  if (query.is_primary !== undefined && query.is_primary !== "") where.is_primary = query.is_primary === true || query.is_primary === "true";
  if (query.due_from || query.due_to) where.due_at = { ...(query.due_from ? { [Op.gte]: new Date(query.due_from) } : {}), ...(query.due_to ? { [Op.lte]: new Date(query.due_to) } : {}) };
  const visibility = await getOperationalScope(tenant.id, actor);
  if (!visibility.isAdmin) {
    if (visibility.ownerOnly) where.owner_id = Number(actor?.id) || -1;
    else where.team_id = query.team_id ? Number(query.team_id) : { [Op.in]: visibility.teamIds.length ? visibility.teamIds : [-1] };
  }
  const { rows, count } = await db.BirthwaveTask.findAndCountAll({ where, include: taskInclude, order: [["due_at", "ASC"], ["id", "ASC"]], limit, offset: (page - 1) * limit, distinct: true });
  return { data: rows.map(serializeTask), pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) || 1 } };
};

export const getTaskById = async (tenant, taskId, actor) => {
  const row = await db.BirthwaveTask.findOne({ where: scope(tenant.id, { id: taskId }), include: taskInclude });
  if (!row) throw httpError(404, "Task not found");
  await assertCanViewTask(tenant.id, row, actor);
  const lineage = await db.BirthwaveTask.findAll({ where: scope(tenant.id, { [Op.or]: [{ id: row.id }, { id: row.parent_task_id }, { parent_task_id: row.id }] }), include: [{ model: db.BirthwaveTeam, as: "team", required: true }, { model: db.Management, as: "owner", required: true }], order: [["created_at", "ASC"], ["id", "ASC"]] });
  const activities = await db.BirthwaveLeadActivity.findAll({ where: scope(tenant.id, { lead_id: row.lead_id }), order: [["occurred_at", "DESC"], ["id", "DESC"]], limit: 20 });
  return {
    task: serializeTask(row),
    lineage: lineage.map(serializeTask),
    primary: Boolean(row.is_primary && ACTIVE_TASK_STATUSES.includes(row.status)),
    activities: activities.map((activity) => ({ id: activity.id, event_type: activity.event_type, title: activity.title, description: activity.description, actor_name: activity.actor_name, occurred_at: activity.occurred_at })),
  };
};

export const createManualTask = async (tenant, data, actor) => {
  await assertCanCreateManualTask(tenant.id, data.team_id, actor);
  const taskId = await runTransaction(async (transaction) => {
    const task = await createTaskInTransaction({ clientId: tenant.id, leadId: data.lead_id, teamId: data.team_id, ownerId: data.owner_id, taskType: "MANUAL_TASK", priority: data.priority || "NORMAL", dueAt: data.due_at, isPrimary: Boolean(data.is_primary), metadata: data.metadata || null, createdFrom: "MANUAL", actor, transaction });
    return task.id;
  });
  return taskResult(tenant.id, taskId);
};

const createSuccessor = async ({ clientId, task, actor, transaction, dueAt, priority = task.priority, parentTaskId = task.id, taskType = "MANUAL_TASK", createdFrom }) => createTaskInTransaction({
  clientId, leadId: task.lead_id, teamId: task.team_id, ownerId: task.owner_id, taskType, priority, dueAt, isPrimary: true, parentTaskId, attemptNumber: task.attempt_number + 1, createdFrom, actor, transaction,
});

export const startTask = async (tenant, taskId, actor) => {
  const resultId = await runTransaction(async (transaction) => {
  const task = await getTaskForTenant(tenant.id, taskId, transaction, true);
  await assertCanMutateTask(tenant.id, task, actor);
  if (task.status !== "PENDING") throw httpError(400, "Only pending Tasks can be started");
  const lead = await getLeadForTenant(tenant.id, task.lead_id, transaction, true);
  const currentStage = leadStage(lead);
  await task.update({ status: "IN_PROGRESS", started_at: new Date(), updated_by: actorId(actor) }, { transaction });
  await logTaskEvent({ clientId: tenant.id, leadId: task.lead_id, actor, eventType: "task_started", title: "Task started", description: `${task.task_type.replaceAll("_", " ")} started`, task, transaction });
  if (["INITIAL_CALL", "RETRY_CALL", "FOLLOW_UP"].includes(task.task_type) && currentStage === "ASSIGNED") {
    await lead.update({ status: "CONTACTING" }, { transaction });
    await logBirthwaveActivity({
      clientId: tenant.id,
      leadId: lead.id,
      actor,
      eventType: "status_changed",
      title: "Lead stage changed",
      description: "Lead moved to CONTACTING when work started",
      previousValue: currentStage,
      newValue: "CONTACTING",
      transaction,
    });
  }
  return task.id;
  });
  return taskResult(tenant.id, resultId);
};

export const completeTask = async (tenant, taskId, data, actor) => {
  const resultId = await runTransaction(async (transaction) => {
  const task = await getTaskForTenant(tenant.id, taskId, transaction, true);
  await assertCanMutateTask(tenant.id, task, actor);
  if (!ACTIVE_TASK_STATUSES.includes(task.status)) throw httpError(400, "Only active Tasks can be completed");
  const lead = await getLeadForTenant(tenant.id, task.lead_id, transaction, true);
  const wasPrimary = Boolean(task.is_primary);
  const successor = data.successor || null;
  if (successor && successor.task_type !== "MANUAL_TASK") throw httpError(400, "Phase 4 successors must be MANUAL_TASKs");
  if (wasPrimary && activeLead(lead) && !successor && !isTenantAdmin(actor)) throw httpError(403, "A primary Task requires a successor or manager completion");
  await task.update({ status: "COMPLETED", is_primary: false, completed_at: new Date(), completion_reason: data.completion_reason, updated_by: actorId(actor) }, { transaction });
  await logTaskEvent({ clientId: tenant.id, leadId: lead.id, actor, eventType: "task_completed", title: "Task completed", description: data.completion_reason, task, transaction });
  if (successor) {
    await createSuccessor({ clientId: tenant.id, task, actor, transaction, dueAt: successor.due_at, priority: successor.priority || task.priority, taskType: "MANUAL_TASK", createdFrom: "TASK_COMPLETION" });
  } else if (wasPrimary && activeLead(lead)) {
    await logBirthwaveActivity({ clientId: tenant.id, leadId: lead.id, actor, eventType: "missing_next_action", title: "Missing next action", description: "Primary Task completed without a successor Task", transaction });
  }
  return task.id;
  });
  return taskResult(tenant.id, resultId);
};

export const rescheduleTask = async (tenant, taskId, data, actor) => {
  const resultId = await runTransaction(async (transaction) => {
  const task = await getTaskForTenant(tenant.id, taskId, transaction, true);
  await assertCanMutateTask(tenant.id, task, actor);
  if (!ACTIVE_TASK_STATUSES.includes(task.status)) throw httpError(400, "Only active Tasks can be rescheduled");
  const wasPrimary = Boolean(task.is_primary);
  await task.update({ status: "RESCHEDULED", is_primary: false, completion_reason: data.reason, updated_by: actorId(actor) }, { transaction });
  await logTaskEvent({ clientId: tenant.id, leadId: task.lead_id, actor, eventType: "task_rescheduled", title: "Task rescheduled", description: data.reason, task, transaction });
  const successor = await createTaskInTransaction({ clientId: tenant.id, leadId: task.lead_id, teamId: task.team_id, ownerId: task.owner_id, taskType: task.task_type, priority: data.priority || task.priority, dueAt: data.due_at, isPrimary: wasPrimary, parentTaskId: task.id, attemptNumber: task.attempt_number, createdFrom: "RESCHEDULE", actor, transaction });
  return successor.id;
  });
  return taskResult(tenant.id, resultId);
};

export const cancelTask = async (tenant, taskId, data, actor) => {
  const resultId = await runTransaction(async (transaction) => {
  const task = await getTaskForTenant(tenant.id, taskId, transaction, true);
  await assertCanMutateTask(tenant.id, task, actor);
  if (!ACTIVE_TASK_STATUSES.includes(task.status)) throw httpError(400, "Only active Tasks can be cancelled");
  const lead = await getLeadForTenant(tenant.id, task.lead_id, transaction, true);
  const wasPrimary = Boolean(task.is_primary);
  const successor = data.successor || null;
  if (successor && successor.task_type !== "MANUAL_TASK") throw httpError(400, "Phase 4 successors must be MANUAL_TASKs");
  if (wasPrimary && activeLead(lead) && !successor && !isTenantAdmin(actor)) throw httpError(403, "A primary Task requires a successor or manager cancellation");
  await task.update({ status: "CANCELLED", is_primary: false, cancelled_at: new Date(), completion_reason: data.reason, updated_by: actorId(actor) }, { transaction });
  await logTaskEvent({ clientId: tenant.id, leadId: lead.id, actor, eventType: "task_cancelled", title: "Task cancelled", description: data.reason, task, transaction });
  if (successor) await createSuccessor({ clientId: tenant.id, task, actor, transaction, dueAt: successor.due_at, priority: successor.priority || task.priority, taskType: "MANUAL_TASK", createdFrom: "TASK_CANCELLATION" });
  else if (wasPrimary && activeLead(lead)) await logBirthwaveActivity({ clientId: tenant.id, leadId: lead.id, actor, eventType: "missing_next_action", title: "Missing next action", description: "Primary Task cancelled without a successor Task", transaction });
  return task.id;
  });
  return taskResult(tenant.id, resultId);
};

export const repairAssignedLeadTask = async ({ clientId, leadId, actor, transaction }) => {
  const lead = await getLeadForTenant(clientId, leadId, transaction, true);
  if (!lead.current_team_id || !lead.current_owner_id) throw httpError(400, "Lead has no complete current assignment");
  const primary = await getPrimaryTask(clientId, lead.id, transaction, true);
  if (primary) return { created: false, reason: "ALREADY_HAS_PRIMARY_TASK", task: primary };
  const task = await createInitialCallTaskInTransaction({ clientId, lead, teamId: lead.current_team_id, ownerId: lead.current_owner_id, actor, transaction, createdFrom: "REPAIR" });
  return { created: true, task };
};

export default { listTasks, getTaskById, createManualTask, startTask, completeTask, rescheduleTask, cancelTask, repairAssignedLeadTask, createInitialCallTaskInTransaction, ensurePrimaryTaskForAssignmentInTransaction, createTaskInTransaction, assertCanMutateTask };
