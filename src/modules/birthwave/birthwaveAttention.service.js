import { Op } from "sequelize";
import db from "../../database/index.js";
import {
  BIRTHWAVE_ATTENTION_STATUSES,
  BIRTHWAVE_ATTENTION_TYPES,
} from "../../database/tables/BirthwaveAttentionTable/index.js";
import { getOperationalScope, isTenantAdmin } from "./birthwavePermissions.service.js";
import { getAppDateKey } from "../../utils/dateTime.js";

const ACTIVE_STAGES = new Set(["ASSIGNED", "CONTACTING", "CONTACTED", "QUALIFIED", "INTERESTED", "APPOINTMENT_SCHEDULED", "ATTENDED"]);
const ACTIVE_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "OVERDUE"];
const LEGACY_STAGE = { new_lead: "NEW", contacted: "CONTACTED", consultation_booked: "APPOINTMENT_SCHEDULED", visited: "ATTENDED", converted: "CONVERTED" };
const UNASSIGNED_MINUTES = Math.max(0, Number(process.env.UNASSIGNED_ATTENTION_MINUTES) || 5);
const TASK_GRACE_MINUTES = Math.max(0, Number(process.env.TASK_ATTENTION_GRACE_MINUTES) || 5);

// BW-FIX-005: severity is a VARCHAR whose vocabulary is exactly
// BIRTHWAVE_ATTENTION_SEVERITIES = ["NORMAL", "HIGH"], so the previous
// `["severity", "DESC"]` sorted it lexicographically — 'NORMAL' > 'HIGH' —
// and put every NORMAL exception ahead of every HIGH one. With the default
// page size of 25 that pushed HIGH items (MISSING_OWNER,
// MISSING_NEXT_ACTION, FOLLOW_UP_OVERDUE) off page 1 as soon as a tenant had
// 25+ NORMAL items, which is the opposite of what the manager queue is for.
// FIELD() ranks HIGH=1, NORMAL=2, anything unknown=0, so ASC yields
// HIGH → NORMAL and keeps unknown values visible at the top rather than
// silently buried.
const SEVERITY_ORDER = db.sequelize.literal("FIELD(`BirthwaveAttentionItem`.`severity`, 'HIGH', 'NORMAL')");

const error = (status, message) => Object.assign(new Error(message), { status });
const stageOf = (lead) => LEGACY_STAGE[lead.status] || String(lead.status || "NEW").toUpperCase();
const activeStage = (lead) => ACTIVE_STAGES.has(stageOf(lead));
const clientIdOf = (tenant) => { if (!tenant?.id) throw error(403, "A valid client context is required"); return Number(tenant.id); };
const ageMinutes = (value) => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
const scopeWhere = (scope, field = "team_id") => scope.isAdmin ? {} : scope.ownerOnly ? { owner_id: scope.ownerId } : {
  [Op.or]: [{ [field]: { [Op.in]: scope.teamIds.length ? scope.teamIds : [-1] } }, { [field]: null }],
};
const leadScopeWhere = (scope) => scope.isAdmin ? {} : scope.ownerOnly ? { current_owner_id: scope.ownerId } : {
  [Op.or]: [{ current_team_id: { [Op.in]: scope.teamIds.length ? scope.teamIds : [-1] } }, { current_team_id: null }],
};

const attentionInclude = [
  { model: db.BirthwaveLead, as: "lead", required: false, attributes: ["id", "name", "phone", "service", "status", "current_team_id", "current_owner_id"] },
  { model: db.BirthwaveTask, as: "task", required: false, attributes: ["id", "task_type", "status", "due_at", "is_primary"] },
  { model: db.BirthwaveTeam, as: "team", required: false, attributes: ["id", "name", "code"] },
  { model: db.Management, as: "owner", required: false, attributes: ["id", "username", "email"] },
];

export const assertCanManageAttention = async (clientId, actor) => {
  if (isTenantAdmin(actor)) return { isAdmin: true, teamIds: [], ownerOnly: false };
  const scope = await getOperationalScope(clientId, actor);
  if (!scope.isManager) throw error(403, "Only Birthwave managers can manage Needs Attention");
  return scope;
};

const serialize = (row) => ({
  id: row.id, client_id: row.client_id, lead_id: row.lead_id, task_id: row.task_id, team_id: row.team_id, owner_id: row.owner_id,
  attention_type: row.attention_type, status: row.status, severity: row.severity, title: row.title, description: row.description,
  detected_at: row.detected_at, acknowledged_at: row.acknowledged_at, resolved_at: row.resolved_at, resolution_note: row.resolution_note,
  dedupe_key: row.dedupe_key, metadata: row.metadata, age_minutes: ageMinutes(row.detected_at),
  lead: row.lead ? { id: row.lead.id, name: row.lead.name, phone: row.lead.phone, service: row.lead.service, stage: stageOf(row.lead) } : null,
  task: row.task ? { id: row.task.id, task_type: row.task.task_type, status: row.task.status, due_at: row.task.due_at, is_primary: row.task.is_primary } : null,
  team: row.team ? { id: row.team.id, name: row.team.name, code: row.team.code } : null,
  owner: row.owner ? { id: row.owner.id, username: row.owner.username, email: row.owner.email } : null,
});

export const listAttention = async (tenant, query = {}, actor) => {
  const clientId = clientIdOf(tenant);
  const scope = await assertCanManageAttention(clientId, actor);
  const where = { client_id: clientId };
  if (query.status) where.status = query.status;
  else where.status = { [Op.in]: ["OPEN", "ACKNOWLEDGED"] };
  if (query.attention_type) where.attention_type = query.attention_type;
  if (query.severity) where.severity = query.severity;
  if (query.lead_id) where.lead_id = Number(query.lead_id);
  if (query.owner_id) where.owner_id = Number(query.owner_id);
  if (query.team_id) {
    const teamId = Number(query.team_id);
    if (!scope.isAdmin && !scope.teamIds.includes(teamId)) throw error(403, "You do not have access to this Team");
    where.team_id = teamId;
  } else if (!scope.isAdmin) Object.assign(where, scopeWhere(scope));
  if (query.date_from || query.date_to) where.detected_at = { ...(query.date_from ? { [Op.gte]: new Date(query.date_from) } : {}), ...(query.date_to ? { [Op.lte]: new Date(query.date_to) } : {}) };
  const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const { rows, count } = await db.BirthwaveAttentionItem.findAndCountAll({ where, include: attentionInclude, order: [SEVERITY_ORDER, ["detected_at", "ASC"], ["id", "ASC"]], limit, offset: (page - 1) * limit });
  return { data: rows.map(serialize), pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) } };
};

const getManaged = async (tenant, id, actor) => {
  const clientId = clientIdOf(tenant); const scope = await assertCanManageAttention(clientId, actor);
  const row = await db.BirthwaveAttentionItem.findOne({ where: { client_id: clientId, id }, include: attentionInclude });
  if (!row) throw error(404, "Attention item not found");
  if (!scope.isAdmin && !scope.teamIds.includes(Number(row.team_id)) && row.team_id !== null) throw error(403, "You do not have access to this Attention item");
  return row;
};
export const getAttention = async (tenant, id, actor) => serialize(await getManaged(tenant, Number(id), actor));

export const updateAttention = async (tenant, id, action, actor, resolutionNote = null) => {
  const row = await getManaged(tenant, Number(id), actor); const now = new Date();
  if (action === "acknowledge") { if (row.status !== "OPEN") throw error(409, "Only OPEN Attention items can be acknowledged"); await row.update({ status: "ACKNOWLEDGED", acknowledged_at: now, acknowledged_by: actor?.id || null }); }
  else { if (!["OPEN", "ACKNOWLEDGED"].includes(row.status)) throw error(409, "This Attention item is already closed"); await row.update({ status: action === "resolve" ? "RESOLVED" : "DISMISSED", resolved_at: now, resolved_by: actor?.id || null, resolution_note: resolutionNote || null }); }
  return serialize(await getManaged(tenant, row.id, actor));
};

const issue = (lead, type, severity, title, description, extra = {}) => ({
  client_id: lead.client_id, lead_id: extra.lead_id ?? lead.id, task_id: extra.task_id ?? null, team_id: extra.team_id ?? lead.current_team_id ?? null, owner_id: extra.owner_id ?? lead.current_owner_id ?? null,
  attention_type: type, severity, title, description, dedupe_key: extra.dedupe_key, metadata: extra.metadata || {}, detected_at: new Date(),
});

const scanTenant = async (clientId, scope = { isAdmin: true, teamIds: [], ownerOnly: false }) => {
  const now = new Date(); const leadWhere = { client_id: clientId, ...leadScopeWhere(scope) };
  const leads = await db.BirthwaveLead.findAll({ where: leadWhere, attributes: ["id", "client_id", "name", "status", "service", "current_team_id", "current_owner_id", "created_at"] });
  const leadIds = leads.map((lead) => lead.id);
  const tasks = leadIds.length ? await db.BirthwaveTask.findAll({ where: { client_id: clientId, lead_id: { [Op.in]: leadIds } }, attributes: ["id", "lead_id", "team_id", "owner_id", "task_type", "status", "due_at", "is_primary"] }) : [];
  const primaryByLead = new Set(tasks.filter((task) => task.is_primary && ACTIVE_TASK_STATUSES.includes(task.status)).map((task) => task.lead_id));
  const failedActivities = leadIds.length ? await db.BirthwaveLeadActivity.findAll({ where: { client_id: clientId, lead_id: { [Op.in]: leadIds }, event_type: { [Op.in]: ["assignment_failed", "routing_failed"] } }, attributes: ["lead_id", "event_type", "occurred_at"], order: [["occurred_at", "DESC"]], raw: true }) : [];
  const failedByLead = new Map(); for (const row of failedActivities) if (!failedByLead.has(row.lead_id)) failedByLead.set(row.lead_id, row);
  const desired = new Map();
  const add = (data) => { if (!desired.has(data.dedupe_key)) desired.set(data.dedupe_key, data); };
  for (const lead of leads) {
    const stage = stageOf(lead); const leadAge = (now - new Date(lead.created_at)) / 60000;
    if (stage === "NEW" && !lead.current_owner_id && leadAge >= UNASSIGNED_MINUTES) add(issue(lead, "UNASSIGNED_LEAD", "NORMAL", "Lead is unassigned", `${lead.name || "Lead"} has not been assigned to an owner.`, { dedupe_key: `lead:${lead.id}:UNASSIGNED_LEAD` }));
    if (ACTIVE_STAGES.has(stage) && !lead.current_owner_id) add(issue(lead, "MISSING_OWNER", "HIGH", "Active Lead has no owner", `${lead.name || "Lead"} is active but has no current owner.`, { dedupe_key: `lead:${lead.id}:MISSING_OWNER` }));
    if (ACTIVE_STAGES.has(stage) && !primaryByLead.has(lead.id)) add(issue(lead, "MISSING_NEXT_ACTION", "HIGH", "Active Lead has no next action", `${lead.name || "Lead"} has no active Primary Next Action.`, { dedupe_key: `lead:${lead.id}:MISSING_NEXT_ACTION` }));
    const failed = failedByLead.get(lead.id); if (failed && !lead.current_owner_id) add(issue(lead, failed.event_type === "routing_failed" ? "ROUTING_FAILED" : "ASSIGNMENT_FAILED", "HIGH", failed.event_type === "routing_failed" ? "Routing failed" : "Assignment failed", `The latest ${failed.event_type.replace("_", " ")} event did not produce an owner.`, { dedupe_key: `lead:${lead.id}:${failed.event_type}` }));
  }
  for (const task of tasks) {
    if (!ACTIVE_TASK_STATUSES.includes(task.status) || !task.due_at) continue;
    const overdueMinutes = (now - new Date(task.due_at)) / 60000; if (overdueMinutes <= TASK_GRACE_MINUTES) continue;
    const lead = leads.find((row) => row.id === task.lead_id); if (!lead) continue;
    if (task.task_type === "FOLLOW_UP") add(issue(lead, "FOLLOW_UP_OVERDUE", "HIGH", "Follow-up is overdue", `${lead.name || "Lead"} has an overdue follow-up task.`, { task_id: task.id, team_id: task.team_id, owner_id: task.owner_id, dedupe_key: `task:${task.id}:FOLLOW_UP_OVERDUE` }));
    else add(issue(lead, "TASK_OVERDUE", "NORMAL", "Task is overdue", `${task.task_type.replaceAll("_", " ")} is overdue without a completed action.`, { task_id: task.id, team_id: task.team_id, owner_id: task.owner_id, dedupe_key: `task:${task.id}:TASK_OVERDUE` }));
  }
  let opened = 0, reopened = 0, unchanged = 0, resolved = 0, errors = 0;
  for (const item of desired.values()) {
    try {
      const existing = await db.BirthwaveAttentionItem.findOne({ where: { client_id: clientId, dedupe_key: item.dedupe_key } });
      if (!existing) { await db.BirthwaveAttentionItem.create(item); opened++; }
      else if (["RESOLVED", "DISMISSED"].includes(existing.status)) { await existing.update({ ...item, status: "OPEN", acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by: null, resolution_note: null }); reopened++; }
      else { await existing.update({ title: item.title, description: item.description, severity: item.severity, team_id: item.team_id, owner_id: item.owner_id, metadata: item.metadata }); unchanged++; }
    } catch (e) { errors++; }
  }
  const existing = await db.BirthwaveAttentionItem.findAll({ where: { client_id: clientId, status: { [Op.in]: ["OPEN", "ACKNOWLEDGED"] }, ...scopeWhere(scope) } });
  for (const row of existing) if (!desired.has(row.dedupe_key)) { await row.update({ status: "RESOLVED", resolved_at: now, resolution_note: "Automatically resolved by attention reconciliation." }); resolved++; }
  return { scanned: leads.length + tasks.length, opened, reopened, resolved, unchanged, errors };
};

export const reconcileAttention = async (tenant, actor, options = {}) => {
  const clientId = clientIdOf(tenant); const scope = options.internal ? { isAdmin: true, teamIds: [], ownerOnly: false } : await assertCanManageAttention(clientId, actor);
  return scanTenant(clientId, scope);
};

export const reconcileAllBirthwaveAttention = async () => {
  const clients = await db.Client.findAll({ attributes: ["id"], raw: true }); const results = [];
  for (const client of clients) { try { results.push({ client_id: client.id, ...(await scanTenant(client.id)) }); } catch (error) { results.push({ client_id: client.id, scanned: 0, opened: 0, reopened: 0, resolved: 0, unchanged: 0, errors: 1 }); } }
  return results;
};

export { BIRTHWAVE_ATTENTION_TYPES, BIRTHWAVE_ATTENTION_STATUSES, getAppDateKey };
