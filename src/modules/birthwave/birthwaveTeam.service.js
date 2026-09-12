import { Op } from "sequelize";
import db from "../../database/index.js";
import { BIRTHWAVE_TEAM_MEMBER_ROLES, BIRTHWAVE_TEAM_MEMBER_STATUSES } from "../../database/tables/BirthwaveTeamMemberTable/index.js";
import { assertCanConfigureTeams, getMemberships, isTenantAdmin } from "./birthwavePermissions.service.js";

const httpError = (status, message) => { const error = new Error(message); error.status = status; return error; };
const scope = (clientId, extra = {}) => ({ client_id: clientId, ...extra });
const text = (value) => typeof value === "string" ? value.trim() : value;
const code = (value) => text(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || null;

const serializeManagement = (row) => row ? ({ id: row.id, username: row.username, email: row.email, role: row.role }) : null;
const serializeMember = (row) => ({
  id: row.id,
  client_id: row.client_id,
  team_id: row.team_id,
  management_id: row.management_id,
  operational_role: row.operational_role,
  assignment_enabled: Boolean(row.assignment_enabled),
  status: row.status,
  service_access: Array.isArray(row.service_access) ? row.service_access : [],
  source_access: Array.isArray(row.source_access) ? row.source_access : [],
  management: serializeManagement(row.management),
});

export const serializeTeam = (row, counts = {}) => ({
  id: row.id,
  client_id: row.client_id,
  name: row.name,
  code: row.code,
  description: row.description ?? null,
  is_active: Boolean(row.is_active),
  member_count: counts.member_count ?? row.members?.length ?? 0,
  assigned_lead_count: counts.assigned_lead_count ?? 0,
  members: row.members?.map(serializeMember) || undefined,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const teamInclude = [{ model: db.BirthwaveTeamMember, as: "members", required: false, include: [{ model: db.Management, as: "management", required: true }] }];

export const listTeams = async (tenant, query = {}, actor) => {
  const where = scope(tenant.id);
  if (!isTenantAdmin(actor)) {
    const memberships = await getMemberships(tenant.id, actor?.id);
    where.id = { [Op.in]: memberships.map((membership) => membership.team_id) || [-1] };
  }
  if (query.active !== undefined && query.active !== "") where.is_active = query.active === true || query.active === "true";
  if (query.search) where[Op.or] = [
    { name: { [Op.like]: `%${query.search}%` } },
    { code: { [Op.like]: `%${query.search}%` } },
  ];
  const rows = await db.BirthwaveTeam.findAll({ where, order: [["is_active", "DESC"], ["name", "ASC"]] });
  return Promise.all(rows.map(async (row) => {
    const [memberCount, leadCount] = await Promise.all([
      db.BirthwaveTeamMember.count({ where: scope(tenant.id, { team_id: row.id }) }),
      db.BirthwaveLead.count({ where: scope(tenant.id, { current_team_id: row.id }) }),
    ]);
    return serializeTeam(row, { member_count: memberCount, assigned_lead_count: leadCount });
  }));
};

export const getTeam = async (tenant, id, actor, options = {}) => {
  if (!options.allowMember && !["super-admin", "admin", "client"].includes(String(actor?.role || "").toLowerCase())) {
    const memberships = await getMemberships(tenant.id, actor?.id);
    if (!memberships.some((membership) => Number(membership.team_id) === Number(id))) throw httpError(403, "You do not have access to this Team");
  }
  const row = await db.BirthwaveTeam.findOne({ where: scope(tenant.id, { id }), include: teamInclude });
  if (!row) throw httpError(404, "Team not found");
  const [leadCount, memberCount] = await Promise.all([
    db.BirthwaveLead.count({ where: scope(tenant.id, { current_team_id: row.id }) }),
    db.BirthwaveTeamMember.count({ where: scope(tenant.id, { team_id: row.id }) }),
  ]);
  return serializeTeam(row, { member_count: memberCount, assigned_lead_count: leadCount });
};

export const createTeam = async (tenant, data, actor) => {
  assertCanConfigureTeams(actor);
  const row = await db.sequelize.transaction(async (transaction) => {
    const created = await db.BirthwaveTeam.create({ client_id: tenant.id, name: text(data.name), code: code(data.code || data.name), description: text(data.description) || null, is_active: data.is_active !== false, created_by: actor?.id ?? null, updated_by: actor?.id ?? null }, { transaction });
    for (const member of data.initial_members || []) await createOrUpdateTeamMember(tenant, created, member, actor, transaction);
    return created;
  });
  return getTeam(tenant, row.id, actor);
};

export const updateTeam = async (tenant, id, data, actor) => {
  assertCanConfigureTeams(actor);
  const row = await db.BirthwaveTeam.findOne({ where: scope(tenant.id, { id }) });
  if (!row) throw httpError(404, "Team not found");
  const patch = {};
  if (data.name !== undefined) patch.name = text(data.name);
  if (data.code !== undefined) patch.code = code(data.code);
  if (data.description !== undefined) patch.description = text(data.description) || null;
  if (data.is_active !== undefined) patch.is_active = Boolean(data.is_active);
  patch.updated_by = actor?.id ?? null;
  await row.update(patch);
  return getTeam(tenant, row.id, actor);
};

const assertManagementInTenant = async (clientId, managementId, options = {}) => {
  const user = await db.Management.findOne({ where: { id: managementId, client_id: clientId }, attributes: ["id", "username", "email", "role"], ...(options.transaction ? { transaction: options.transaction } : {}) });
  if (!user) throw httpError(400, "Management user does not belong to this client");
  return user;
};

const assertTeam = async (clientId, teamId, options = {}) => {
  const team = await db.BirthwaveTeam.findOne({ where: scope(clientId, { id: teamId }), ...(options.transaction ? { transaction: options.transaction } : {}) });
  if (!team) throw httpError(404, "Team not found");
  return team;
};

export const listTeamMembers = async (tenant, teamId, actor) => {
  const team = await assertTeam(tenant.id, teamId);
  if (!['super-admin', 'admin', 'client'].includes(String(actor?.role || '').toLowerCase())) {
    const memberships = await getMemberships(tenant.id, actor?.id);
    if (!memberships.some((membership) => Number(membership.team_id) === Number(team.id))) throw httpError(403, "You do not have access to this Team");
  }
  const rows = await db.BirthwaveTeamMember.findAll({ where: scope(tenant.id, { team_id: team.id }), include: [{ model: db.Management, as: "management", required: true }], order: [["status", "ASC"], ["id", "ASC"]] });
  return rows.map(serializeMember);
};

const createOrUpdateTeamMember = async (tenant, team, data, actor, transaction) => {
  const management = await assertManagementInTenant(tenant.id, Number(data.management_id), { transaction });
  if (!BIRTHWAVE_TEAM_MEMBER_ROLES.includes(data.operational_role)) throw httpError(400, "Invalid operational role");
  const existing = await db.BirthwaveTeamMember.findOne({ where: scope(tenant.id, { team_id: team.id, management_id: management.id }), ...(transaction ? { transaction } : {}) });
  const values = { operational_role: data.operational_role, assignment_enabled: data.assignment_enabled !== false, status: data.status || "ACTIVE", service_access: data.service_access || [], source_access: data.source_access || [], updated_by: actor?.id ?? null };
  if (existing) { await existing.update(values, transaction ? { transaction } : undefined); return serializeMember(await db.BirthwaveTeamMember.findOne({ where: { id: existing.id }, include: [{ model: db.Management, as: "management" }], ...(transaction ? { transaction } : {}) })); }
  if (!BIRTHWAVE_TEAM_MEMBER_STATUSES.includes(values.status)) throw httpError(400, "Invalid membership status");
  const row = await db.BirthwaveTeamMember.create({ client_id: tenant.id, team_id: team.id, management_id: management.id, created_by: actor?.id ?? null, ...values }, transaction ? { transaction } : undefined);
  row.management = management;
  return serializeMember(row);
};

export const addTeamMember = async (tenant, teamId, data, actor) => {
  assertCanConfigureTeams(actor);
  const team = await assertTeam(tenant.id, teamId);
  return createOrUpdateTeamMember(tenant, team, data, actor);
};

export const updateTeamMember = async (tenant, teamId, memberId, data, actor) => {
  assertCanConfigureTeams(actor);
  await assertTeam(tenant.id, teamId);
  const row = await db.BirthwaveTeamMember.findOne({ where: scope(tenant.id, { id: memberId, team_id: teamId }), include: [{ model: db.Management, as: "management" }] });
  if (!row) throw httpError(404, "Team member not found");
  const patch = {};
  if (data.operational_role !== undefined) {
    if (!BIRTHWAVE_TEAM_MEMBER_ROLES.includes(data.operational_role)) throw httpError(400, "Invalid operational role");
    patch.operational_role = data.operational_role;
  }
  if (data.status !== undefined) {
    if (!BIRTHWAVE_TEAM_MEMBER_STATUSES.includes(data.status)) throw httpError(400, "Invalid membership status");
    patch.status = data.status;
  }
  if (data.assignment_enabled !== undefined) patch.assignment_enabled = Boolean(data.assignment_enabled);
  if (data.service_access !== undefined) patch.service_access = data.service_access;
  if (data.source_access !== undefined) patch.source_access = data.source_access;
  patch.updated_by = actor?.id ?? null;
  await row.update(patch);
  return serializeMember(row);
};

export const getMyTeamMemberships = async (tenant, actor) => {
  if (["super-admin", "admin", "client"].includes(String(actor?.role || "").toLowerCase())) return { is_admin: true, memberships: [] };
  const memberships = await getMemberships(tenant.id, actor?.id, { includeInactive: true });
  return { is_admin: false, memberships: memberships.map(serializeMember) };
};

export const listManagementCandidates = async (tenant, actor) => {
  assertCanConfigureTeams(actor);
  const rows = await db.Management.findAll({ where: { client_id: tenant.id }, attributes: ["id", "username", "email", "role"], order: [["username", "ASC"]] });
  return rows.map(serializeManagement);
};

export { serializeMember };
