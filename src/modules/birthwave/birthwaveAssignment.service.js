import { Op } from "sequelize";
import db from "../../database/index.js";
import { BIRTHWAVE_ASSIGNMENT_METHODS } from "../../database/tables/BirthwaveAssignmentRuleTable/index.js";
import { BIRTHWAVE_ASSIGNMENT_TYPES } from "../../database/tables/BirthwaveLeadAssignmentTable/index.js";
import { assertCanAssign, assertCanConfigureTeams, isTenantAdmin } from "./birthwavePermissions.service.js";
import { logBirthwaveActivity } from "./birthwaveActivity.service.js";
import { ensurePrimaryTaskForAssignmentInTransaction, serializeTask } from "./birthwaveTask.service.js";

const httpError = (status, message) => { const error = new Error(message); error.status = status; return error; };
const scope = (clientId, extra = {}) => ({ client_id: clientId, ...extra });
const activeRole = (value) => ["TEAM_MANAGER", "TELECALLER"].includes(value);
const arrayOrEmpty = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
};

const serializeManagement = (row) => row ? ({ id: row.id, username: row.username, email: row.email, role: row.role }) : null;
export const serializeAssignment = (row) => ({
  id: row.id,
  lead_id: row.lead_id,
  team_id: row.team_id,
  team: row.team ? { id: row.team.id, name: row.team.name, code: row.team.code } : null,
  owner_id: row.owner_id,
  owner: serializeManagement(row.owner),
  assignment_type: row.assignment_type,
  assigned_by: row.assigned_by,
  assignedBy: serializeManagement(row.assignedBy),
  reason: row.reason ?? null,
  is_current: Boolean(row.is_current),
  assigned_at: row.assigned_at,
  ended_at: row.ended_at,
});

const assignmentInclude = [
  { model: db.BirthwaveTeam, as: "team", required: true },
  { model: db.Management, as: "owner", required: true },
  { model: db.Management, as: "assignedBy", required: false },
];

const getLeadForTenant = async (clientId, leadId, transaction, lock = false) => {
  const row = await db.BirthwaveLead.findOne({ where: scope(clientId, { id: leadId }), ...(transaction ? { transaction } : {}), ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!row) throw httpError(404, "Lead not found");
  // BW-SVC-001: the service master row is fetched separately rather than joined,
  // because this query takes FOR UPDATE and MySQL cannot lock the nullable side
  // of an outer join. Attaching it lets eligibility match the service's CURRENT
  // name/slug instead of the Lead's possibly-stale legacy text after a rename.
  await attachServiceRef(clientId, row, transaction);
  return row;
};

const attachServiceRef = async (clientId, lead, transaction) => {
  if (!lead?.service_id) return lead;
  const service = await db.BirthwaveService.findOne({
    where: scope(clientId, { id: lead.service_id }),
    ...(transaction ? { transaction } : {}),
  });
  if (service) lead.serviceRef = service;
  return lead;
};

const getTeamForTenant = async (clientId, teamId, transaction, lock = false) => {
  const team = await db.BirthwaveTeam.findOne({ where: scope(clientId, { id: teamId }), ...(transaction ? { transaction } : {}), ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!team) throw httpError(404, "Team not found");
  if (!team.is_active) throw httpError(400, "Team is inactive");
  return team;
};

const getEligibleMembers = async (clientId, teamId, lead, transaction) => {
  const rows = await db.BirthwaveTeamMember.findAll({
    where: scope(clientId, { team_id: teamId, status: "ACTIVE", assignment_enabled: true }),
    include: [{ model: db.Management, as: "management", required: true, attributes: ["id", "username", "email", "role"] }],
    order: [["id", "ASC"]],
    ...(transaction ? { transaction } : {}),
  });
  return rows.filter((row) => {
    if (!activeRole(row.operational_role)) return false;
    const services = arrayOrEmpty(row.service_access);
    const sources = arrayOrEmpty(row.source_access);
    return serviceAccessAllows(services, lead) && (!sources.length || sources.includes(lead.source));
  });
};

/**
 * BW-SVC-001: `birthwave_team_members.service_access` is a free-text array that
 * predates the service master, so entries may be a service NAME (how it was
 * configured before) or a SLUG (rename-safe, and what the UI writes now). An
 * empty list means "all services". Matching accepts either form — and matching
 * on the Lead's CURRENT service name rather than its stored legacy text is what
 * keeps eligibility working after a service is renamed.
 */
const serviceAccessAllows = (services, lead) => {
  if (!services.length) return true;
  const candidates = new Set(
    [lead.serviceRef?.name, lead.serviceRef?.slug, lead.service]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase()),
  );
  return services.some((entry) => candidates.has(String(entry).trim().toLowerCase()));
};

const validateOwner = async (clientId, teamId, ownerId, lead, transaction) => {
  const member = await db.BirthwaveTeamMember.findOne({
    where: scope(clientId, { team_id: teamId, management_id: ownerId }),
    include: [{ model: db.Management, as: "management", required: true, attributes: ["id", "username", "email", "role"] }],
    ...(transaction ? { transaction } : {}),
  });
  if (!member) throw httpError(400, "Owner is not a member of this Team");
  if (member.status !== "ACTIVE" || !member.assignment_enabled) throw httpError(400, "Owner is not eligible for assignment");
  if (!activeRole(member.operational_role)) throw httpError(400, "Owner does not have an eligible operational role");
  const services = arrayOrEmpty(member.service_access);
  const sources = arrayOrEmpty(member.source_access);
  if (!serviceAccessAllows(services, lead)) throw httpError(400, "Owner is not eligible for this Lead service");
  if (sources.length && !sources.includes(lead.source)) throw httpError(400, "Owner is not eligible for this Lead source");
  return member;
};

const getCurrentAssignment = async (clientId, leadId, transaction) => db.BirthwaveLeadAssignment.findOne({
  where: scope(clientId, { lead_id: leadId, is_current: true }),
  order: [["id", "DESC"]],
  ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
});

const assignInTransaction = async ({ clientId, leadId, teamId, ownerId, actor, reason, assignmentType, transaction }) => {
  const lead = await getLeadForTenant(clientId, leadId, transaction, true);
  const team = await getTeamForTenant(clientId, teamId, transaction, true);
  const member = await validateOwner(clientId, team.id, ownerId, lead, transaction);
  const current = await getCurrentAssignment(clientId, lead.id, transaction);
  const now = new Date();
  if (current) {
    await current.update({ is_current: false, ended_at: now }, { transaction });
  }
  const type = current && assignmentType === "MANUAL" ? "REASSIGNMENT" : assignmentType;
  if (!BIRTHWAVE_ASSIGNMENT_TYPES.includes(type)) throw httpError(400, "Invalid assignment type");
  const assignment = await db.BirthwaveLeadAssignment.create({
    client_id: clientId,
    lead_id: lead.id,
    team_id: team.id,
    owner_id: member.management_id,
    assignment_type: type,
    assigned_by: actor?.id ?? null,
    reason: reason || null,
    is_current: true,
    assigned_at: now,
  }, { transaction });
  const previousStage = lead.status;
  // BW-FIX-002: status is stored in canonical stage form ("ASSIGNED"), not legacy.
  const nextStatus = String(lead.status || "").toUpperCase() === "NEW" || lead.status === "new_lead" ? "ASSIGNED" : lead.status;
  await lead.update({ current_team_id: team.id, current_owner_id: member.management_id, status: nextStatus }, { transaction });
  const task = await ensurePrimaryTaskForAssignmentInTransaction({
    clientId,
    lead,
    teamId: team.id,
    ownerId: member.management_id,
    actor,
    transaction,
    reassigned: Boolean(current),
  });
  const eventType = current ? "reassigned" : "assigned";
  await logBirthwaveActivity({
    clientId,
    leadId: lead.id,
    actor,
    eventType,
    title: current ? "Lead reassigned" : "Lead assigned",
    description: `${lead.name} assigned to ${member.management?.username || member.management_id} · ${team.name} · ${type}`,
    previousValue: current ? `${current.team_id}:${current.owner_id}` : previousStage,
    newValue: `${team.id}:${member.management_id}`,
    transaction,
  });
  const result = await db.BirthwaveLeadAssignment.findOne({ where: { id: assignment.id }, include: assignmentInclude, transaction });
  return { assignment, serialized: serializeAssignment(result), task, task_serialized: serializeTask(task), lead, team, member };
};

const withTransaction = async (callback) => {
  const transaction = await db.sequelize.transaction();
  try { const result = await callback(transaction); await transaction.commit(); return result; }
  catch (error) { await transaction.rollback(); throw error; }
};

export const assignLead = async ({ tenant, leadId, teamId, ownerId, actor, reason, assignmentType = "MANUAL" }) => {
  await assertCanAssign(tenant.id, actor, teamId);
  return withTransaction((transaction) => assignInTransaction({ clientId: tenant.id, leadId, teamId, ownerId, actor, reason, assignmentType, transaction }));
};

export const bulkAssignLeads = async ({ tenant, leadIds, teamId, ownerId, actor, reason }) => {
  await assertCanAssign(tenant.id, actor, teamId);
  const ids = [...new Set(leadIds.map(Number))];
  if (!ids.length || ids.length > 100) throw httpError(400, "Bulk assignment must include between 1 and 100 Leads");
  const existing = await db.BirthwaveLead.findAll({ where: scope(tenant.id, { id: { [Op.in]: ids } }), attributes: ["id"] });
  const existingIds = new Set(existing.map((row) => row.id));
  const results = [];
  for (const leadId of ids) {
    if (!existingIds.has(leadId)) { results.push({ lead_id: leadId, status: "failed", message: "Lead not found in this client" }); continue; }
    try {
      const result = await assignLead({ tenant, leadId, teamId, ownerId, actor, reason, assignmentType: "BULK_MANUAL" });
      results.push({ lead_id: leadId, assignment_id: result.assignment.id, task_id: result.task.id, owner_id: result.assignment.owner_id, team_id: result.assignment.team_id, status: "assigned", assignment: result.serialized, task: result.task_serialized });
    } catch (error) {
      results.push({ lead_id: leadId, status: "failed", message: error.message });
    }
  }
  return { success_count: results.filter((row) => row.status === "assigned").length, failed_count: results.filter((row) => row.status === "failed").length, results };
};

export const assignLeadRoundRobin = async ({ tenant, leadId, teamId, actor, reason, scopeKey }) => {
  await assertCanAssign(tenant.id, actor, teamId);
  return withTransaction(async (transaction) => {
    const lead = await getLeadForTenant(tenant.id, leadId, transaction, true);
    const team = await getTeamForTenant(tenant.id, teamId, transaction, true);
    // BW-SVC-001: prefer the Lead's service id so the cursor survives a rename.
    const key = scopeKey || `${lead.service_id ? `svc:${lead.service_id}` : lead.service || "*"}:${lead.source || "*"}`;
    let cursor = await db.BirthwaveAssignmentCursor.findOne({ where: scope(tenant.id, { team_id: team.id, scope_key: key }), transaction, lock: transaction.LOCK.UPDATE });
    if (!cursor) cursor = await db.BirthwaveAssignmentCursor.create({ client_id: tenant.id, team_id: team.id, scope_key: key, last_member_id: null, version: 0 }, { transaction });
    const eligible = await getEligibleMembers(tenant.id, team.id, lead, transaction);
    if (!eligible.length) {
      await logBirthwaveActivity({ clientId: tenant.id, leadId: lead.id, actor, eventType: "assignment_failed", title: "Assignment failed", description: `No eligible member found for ${team.name}`, transaction });
      return { assigned: false, reason: "NO_ELIGIBLE_MEMBER", lead_id: lead.id, team_id: team.id };
    }
    const lastIndex = eligible.findIndex((member) => Number(member.id) === Number(cursor.last_member_id));
    const selected = eligible[(lastIndex + 1 + eligible.length) % eligible.length];
    const result = await assignInTransaction({ clientId: tenant.id, leadId, teamId: team.id, ownerId: selected.management_id, actor, reason, assignmentType: "ROUND_ROBIN", transaction });
    await cursor.update({ last_member_id: selected.id, version: Number(cursor.version || 0) + 1 }, { transaction });
    return { assigned: true, ...result };
  });
};

export const listAssignments = async (tenant, leadId, actor) => {
  const lead = await getLeadForTenant(tenant.id, leadId);
  if (!isTenantAdmin(actor)) {
    const { assertCanViewLead } = await import("./birthwavePermissions.service.js");
    await assertCanViewLead(tenant.id, lead, actor);
  }
  const rows = await db.BirthwaveLeadAssignment.findAll({ where: scope(tenant.id, { lead_id: leadId }), include: assignmentInclude, order: [["assigned_at", "DESC"], ["id", "DESC"]], });
  return rows.map(serializeAssignment);
};

/**
 * BW-SVC-001: a rule's service criterion matches by `service_id` whenever the
 * rule has one — that is what makes a service rename safe, because both sides
 * are ids. Rules created before the service master (service_id still NULL) keep
 * matching on their legacy text so no existing routing silently stops working.
 */
const matchingRuleService = (rule, lead) => {
  if (rule.service_id) return Number(rule.service_id) === Number(lead.service_id);
  if (!rule.service) return true; // "any service"
  return rule.service === lead.service;
};

const matchingRule = (rule, lead) => matchingRuleService(rule, lead) && (!rule.source || rule.source === lead.source);

export const routeLeadByRules = async ({ tenant, leadId, actor = null }) => {
  const lead = await getLeadForTenant(tenant.id, leadId);
  const rules = await db.BirthwaveAssignmentRule.findAll({ where: scope(tenant.id, { is_active: true }), include: [{ model: db.BirthwaveTeam, as: "team", required: true }, { model: db.BirthwaveService, as: "serviceRef", required: false }], order: [["priority", "ASC"], ["id", "ASC"]] });
  const rule = rules.find((candidate) => matchingRule(candidate, lead));
  if (!rule) return { assigned: false, reason: "NO_MATCHING_RULE", lead_id: lead.id };
  if (!rule.team.is_active) {
    await logBirthwaveActivity({ clientId: tenant.id, leadId: lead.id, actor, eventType: "routing_failed", title: "Routing failed", description: `Assignment rule ${rule.name} selected an inactive Team` });
    return { assigned: false, reason: "INACTIVE_TEAM", lead_id: lead.id, rule_id: rule.id };
  }
  if (rule.assignment_method === "MANUAL") {
    await logBirthwaveActivity({ clientId: tenant.id, leadId: lead.id, actor, eventType: "team_selected", title: "Team selected", description: `${rule.name} selected ${rule.team.name}; manual owner assignment required` });
    return { assigned: false, pending_manual: true, reason: "MANUAL_ASSIGNMENT", lead_id: lead.id, team_id: rule.team_id, rule_id: rule.id };
  }
  // BW-SVC-001: key the round-robin cursor on the rule's service id where it has
  // one, so renaming a service does not silently start a fresh rotation.
  const ruleScopeKey = `${rule.service_id ? `svc:${rule.service_id}` : rule.service || "*"}:${rule.source || "*"}`;
  const result = await assignLeadRoundRobin({ tenant, leadId: lead.id, teamId: rule.team_id, actor, reason: `Routing rule: ${rule.name}`, scopeKey: ruleScopeKey });
  return { ...result, rule_id: rule.id };
};

/**
 * BW-SVC-001: resolves a rule's service criterion.
 *
 * An explicit `service_id` must belong to this tenant — that is an integrity
 * error worth rejecting. Free text, however, is only *upgraded* to a service_id
 * when it matches one: unrecognised text is left as-is so rules written against
 * arbitrary service strings before the service master existed keep matching
 * exactly as they did (§9 — preserve existing rule behaviour, don't break round
 * robin). New rules created through the UI always send service_id.
 */
const resolveRuleService = async (clientId, data) => {
  if (data.service_id === null) return null;
  if (data.service_id !== undefined) {
    const service = await db.BirthwaveService.findOne({ where: scope(clientId, { id: Number(data.service_id) }) });
    if (!service) throw httpError(400, "Selected service does not belong to this client");
    return service;
  }
  const text = String(data.service || "").trim();
  if (!text) return null;
  const services = await db.BirthwaveService.findAll({ where: scope(clientId) });
  return services.find((row) => row.name.trim().toLowerCase() === text.toLowerCase() || row.slug === text.toLowerCase()) || null;
};

const serializeRule = (row) => ({ id: row.id, name: row.name, priority: row.priority, service_id: row.service_id ?? null, service: row.serviceRef?.name ?? row.service, service_ref: row.serviceRef ? { id: row.serviceRef.id, name: row.serviceRef.name, slug: row.serviceRef.slug, is_active: Boolean(row.serviceRef.is_active) } : null, source: row.source, team_id: row.team_id, team: row.team ? { id: row.team.id, name: row.team.name, code: row.team.code } : null, assignment_method: row.assignment_method, is_active: Boolean(row.is_active), created_at: row.created_at, updated_at: row.updated_at });

export const listAssignmentRules = async (tenant, actor) => {
  assertCanConfigureTeams(actor);
  const rows = await db.BirthwaveAssignmentRule.findAll({ where: scope(tenant.id), include: [{ model: db.BirthwaveTeam, as: "team", required: true }, { model: db.BirthwaveService, as: "serviceRef", required: false }], order: [["priority", "ASC"], ["id", "ASC"]] });
  return rows.map(serializeRule);
};

export const createAssignmentRule = async (tenant, data, actor) => {
  assertCanConfigureTeams(actor);
  const team = await getTeamForTenant(tenant.id, Number(data.team_id));
  if (!BIRTHWAVE_ASSIGNMENT_METHODS.includes(data.assignment_method)) throw httpError(400, "Invalid assignment method");
  // BW-SVC-001: rules are stored against service_id. The legacy text is kept in
  // step with the service's display name so older readers still make sense.
  const ruleService = await resolveRuleService(tenant.id, data);
  const row = await db.BirthwaveAssignmentRule.create({ client_id: tenant.id, name: data.name.trim(), priority: Number(data.priority ?? 100), service_id: ruleService?.id ?? null, service: ruleService?.name ?? data.service ?? null, source: data.source || null, team_id: team.id, assignment_method: data.assignment_method, is_active: data.is_active !== false });
  return serializeRule(await db.BirthwaveAssignmentRule.findOne({ where: { id: row.id }, include: [{ model: db.BirthwaveTeam, as: "team" }, { model: db.BirthwaveService, as: "serviceRef", required: false }] }));
};

export const updateAssignmentRule = async (tenant, id, data, actor) => {
  assertCanConfigureTeams(actor);
  const row = await db.BirthwaveAssignmentRule.findOne({ where: scope(tenant.id, { id }) });
  if (!row) throw httpError(404, "Assignment rule not found");
  const patch = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.priority !== undefined) patch.priority = Number(data.priority);
  if (data.service_id !== undefined || data.service !== undefined) {
    const ruleService = await resolveRuleService(tenant.id, data);
    patch.service_id = ruleService?.id ?? null;
    patch.service = ruleService?.name ?? (data.service || null);
  }
  if (data.source !== undefined) patch.source = data.source || null;
  if (data.team_id !== undefined) { await getTeamForTenant(tenant.id, Number(data.team_id)); patch.team_id = Number(data.team_id); }
  if (data.assignment_method !== undefined) { if (!BIRTHWAVE_ASSIGNMENT_METHODS.includes(data.assignment_method)) throw httpError(400, "Invalid assignment method"); patch.assignment_method = data.assignment_method; }
  if (data.is_active !== undefined) patch.is_active = Boolean(data.is_active);
  await row.update(patch);
  return serializeRule(await db.BirthwaveAssignmentRule.findOne({ where: { id: row.id }, include: [{ model: db.BirthwaveTeam, as: "team" }, { model: db.BirthwaveService, as: "serviceRef", required: false }] }));
};

export default { assignLead, bulkAssignLeads, assignLeadRoundRobin, listAssignments, routeLeadByRules, listAssignmentRules, createAssignmentRule, updateAssignmentRule };
