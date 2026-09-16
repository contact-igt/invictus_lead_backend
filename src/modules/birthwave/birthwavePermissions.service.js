import { Op } from "sequelize";
import db from "../../database/index.js";

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const isTenantAdmin = (actor) => ["super-admin", "admin", "client"].includes(String(actor?.role || "").toLowerCase());

export const getMemberships = async (clientId, managementId, options = {}) => db.BirthwaveTeamMember.findAll({
  where: {
    client_id: clientId,
    management_id: managementId,
    ...(options.includeInactive ? {} : { status: { [Op.ne]: "INACTIVE" } }),
  },
  include: [{ model: db.BirthwaveTeam, as: "team", required: true }],
  order: [[{ model: db.BirthwaveTeam, as: "team" }, "name", "ASC"]],
  ...(options.transaction ? { transaction: options.transaction } : {}),
});

export const getOperationalScope = async (clientId, actor) => {
  if (isTenantAdmin(actor)) return { isAdmin: true, teamIds: [], ownerOnly: false };
  const memberships = await getMemberships(clientId, actor?.id);
  const teamIds = memberships.map((membership) => membership.team_id);
  const isManager = memberships.some((membership) => membership.operational_role === "TEAM_MANAGER");
  const isTelecaller = memberships.some((membership) => membership.operational_role === "TELECALLER");
  if (!isManager && !isTelecaller) return { isAdmin: false, teamIds: [], ownerOnly: true, ownerId: Number(actor?.id) || -1 };
  return { isAdmin: false, teamIds, ownerOnly: !isManager, ownerId: Number(actor?.id) || -1, isManager };
};

export const assertCanConfigureTeams = (actor) => {
  if (!isTenantAdmin(actor)) throw httpError(403, "Only Birthwave administrators can configure teams");
};

export const assertCanAssign = async (clientId, actor, teamId, options = {}) => {
  if (isTenantAdmin(actor)) return;
  const membership = await db.BirthwaveTeamMember.findOne({
    where: {
      client_id: clientId,
      team_id: teamId,
      management_id: actor?.id,
      operational_role: "TEAM_MANAGER",
      status: "ACTIVE",
    },
    ...(options.transaction ? { transaction: options.transaction } : {}),
  });
  if (!membership) throw httpError(403, "You can only assign leads within an authorized team");
};

export const assertCanViewLead = async (clientId, lead, actor) => {
  if (isTenantAdmin(actor)) return;
  const scope = await getOperationalScope(clientId, actor);
  const allowed = scope.ownerOnly
    ? Number(lead.current_owner_id) === Number(actor?.id)
    : scope.teamIds.includes(Number(lead.current_team_id));
  if (!allowed) throw httpError(403, "You do not have access to this Lead");
};

export const assertCanEditLead = async (clientId, lead, actor) => {
  if (isTenantAdmin(actor)) return;
  const scope = await getOperationalScope(clientId, actor);
  if (scope.ownerOnly) throw httpError(403, "Telecallers can only add notes to their assigned Leads");
  await assertCanViewLead(clientId, lead, actor);
};

export const leadVisibilityWhere = async (clientId, actor) => {
  if (isTenantAdmin(actor)) return {};
  const scope = await getOperationalScope(clientId, actor);
  if (scope.ownerOnly) return { current_owner_id: scope.ownerId };
  if (!scope.teamIds.length) return { current_team_id: -1 };
  return { current_team_id: { [Op.in]: scope.teamIds } };
};

export default {
  isTenantAdmin,
  getMemberships,
  getOperationalScope,
  assertCanConfigureTeams,
  assertCanAssign,
  assertCanViewLead,
  assertCanEditLead,
  leadVisibilityWhere,
};
