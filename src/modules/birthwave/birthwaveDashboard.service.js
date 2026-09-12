import { Op } from "sequelize";
import db from "../../database/index.js";
import { getInclusiveDateRange, getTodayBounds, buildAppDateTime, getAppDateKey } from "../../utils/dateTime.js";
import { getOperationalScope, isTenantAdmin } from "./birthwavePermissions.service.js";

const TIMEZONE = "Asia/Kolkata";
const ACTIVE_TASKS = ["PENDING", "IN_PROGRESS", "OVERDUE"];
const addDays = (dateKey, amount) => { const date = new Date(`${dateKey}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const rangeFor = (query = {}) => {
  if (query.start_date || query.end_date) {
    const parsed = getInclusiveDateRange(query.start_date, query.end_date);
    return { preset: "custom", start: parsed.start || getTodayBounds().start, end: parsed.end || getTodayBounds().end };
  }
  const today = getTodayBounds(); const key = getAppDateKey(today.now); const preset = query.range || "today";
  if (preset === "last_7_days" || preset === "7d") return { preset: "last_7_days", start: buildAppDateTime(addDays(key, -6), "00:00:00.000"), end: today.end };
  if (preset === "last_30_days" || preset === "30d") return { preset: "last_30_days", start: buildAppDateTime(addDays(key, -29), "00:00:00.000"), end: today.end };
  return { preset: "today", start: today.start, end: today.end };
};
const whereDate = (field, start, end) => ({ [field]: { [Op.gte]: start, [Op.lte]: end } });
const scoped = (scope, teamField = "current_team_id", ownerField = "current_owner_id") => {
  if (scope.isAdmin) return {};
  if (scope.ownerOnly) return { [ownerField]: scope.ownerId };
  return { [teamField]: { [Op.in]: scope.teamIds.length ? scope.teamIds : [-1] } };
};
const count = (rows, predicate) => rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);
const num = (value) => Number(value || 0);

export const getOperationalDashboard = async (tenant, query = {}, actor = null) => {
  const clientId = Number(tenant?.id); if (!clientId) throw Object.assign(new Error("A valid client context is required"), { status: 403 });
  const scope = actor ? await getOperationalScope(clientId, actor) : { isAdmin: true, teamIds: [], ownerOnly: false };
  const range = rangeFor(query); const today = getTodayBounds();
  const sourceWhere = query.source ? { source: query.source } : {};
  const leadRows = await db.BirthwaveLead.findAll({ where: { client_id: clientId, ...sourceWhere, ...scoped(scope), ...whereDate("created_at", range.start, range.end) }, attributes: ["id", "service", "source", "status", "current_team_id", "current_owner_id", "created_at"], raw: true });
  const allScopedLeads = await db.BirthwaveLead.findAll({ where: { client_id: clientId, ...sourceWhere, ...scoped(scope) }, attributes: ["id", "service", "source", "status", "current_team_id", "current_owner_id", "created_at"], raw: true });
  const taskRows = await db.BirthwaveTask.findAll({ where: { client_id: clientId, ...scoped(scope, "team_id", "owner_id") }, attributes: ["id", "lead_id", "team_id", "owner_id", "task_type", "status", "due_at", "completed_at", "is_primary"], raw: true });
  const appointmentRows = await db.BirthwaveAppointment.findAll({ where: { client_id: clientId, ...whereDate("scheduled_at", today.start, today.end), ...(scope.isAdmin ? {} : scope.ownerOnly ? { "$lead.current_owner_id$": scope.ownerId } : { "$lead.current_team_id$": { [Op.in]: scope.teamIds.length ? scope.teamIds : [-1] } }) }, include: scope.isAdmin ? [] : [{ model: db.BirthwaveLead, as: "lead", required: true, attributes: [] }], attributes: ["id", "status", "scheduled_at"], raw: true });
  const attentionRows = await db.BirthwaveAttentionItem.findAll({ where: { client_id: clientId, status: { [Op.in]: ["OPEN", "ACKNOWLEDGED"] }, ...scoped(scope) }, attributes: ["id", "attention_type", "team_id", "owner_id"], raw: true });
  const completedToday = count(taskRows, (row) => row.status === "COMPLETED" && row.completed_at && new Date(row.completed_at) >= today.start && new Date(row.completed_at) <= today.end);
  const dueToday = count(taskRows, (row) => ACTIVE_TASKS.includes(row.status) && row.due_at && new Date(row.due_at) >= today.start && new Date(row.due_at) <= today.end);
  const overdue = count(taskRows, (row) => ACTIVE_TASKS.includes(row.status) && row.due_at && new Date(row.due_at) < new Date());
  const followUps = count(taskRows, (row) => ACTIVE_TASKS.includes(row.status) && row.task_type === "FOLLOW_UP" && row.due_at && new Date(row.due_at) <= today.end);
  const leadSources = new Map(); const services = new Map();
  for (const row of leadRows) { if (row.source) leadSources.set(row.source, (leadSources.get(row.source) || 0) + 1); if (row.service) services.set(row.service, (services.get(row.service) || 0) + 1); }
  const teams = await db.BirthwaveTeam.findAll({ where: { client_id: clientId, ...(scope.isAdmin ? {} : { id: { [Op.in]: scope.teamIds.length ? scope.teamIds : [-1] } }) }, attributes: ["id", "name", "code"], raw: true });
  const members = await db.BirthwaveTeamMember.findAll({ where: { client_id: clientId, status: { [Op.ne]: "INACTIVE" }, ...(scope.isAdmin ? {} : scope.ownerOnly ? { management_id: scope.ownerId } : { team_id: { [Op.in]: scope.teamIds.length ? scope.teamIds : [-1] } }) }, include: [{ model: db.Management, as: "management", attributes: ["id", "username", "email"], required: true }], raw: true, nest: true });
  const teamSummary = teams.map((team) => ({ team: { id: team.id, name: team.name, code: team.code }, assigned_leads: count(allScopedLeads, (row) => row.current_team_id === team.id && row.current_owner_id), tasks_due: count(taskRows, (row) => row.team_id === team.id && ACTIVE_TASKS.includes(row.status) && row.due_at && new Date(row.due_at) >= today.start && new Date(row.due_at) <= today.end), completed_today: count(taskRows, (row) => row.team_id === team.id && row.status === "COMPLETED" && row.completed_at && new Date(row.completed_at) >= today.start && new Date(row.completed_at) <= today.end), overdue: count(taskRows, (row) => row.team_id === team.id && ACTIVE_TASKS.includes(row.status) && row.due_at && new Date(row.due_at) < new Date()), open_attention: count(attentionRows, (row) => row.team_id === team.id) }));
  const telecallerSummary = members.map((member) => { const id = member.management_id; return { owner: { id, username: member.management?.username || "", email: member.management?.email || "" }, tasks_today: count(taskRows, (row) => row.owner_id === id && ACTIVE_TASKS.includes(row.status) && row.due_at && new Date(row.due_at) >= today.start && new Date(row.due_at) <= today.end), completed: count(taskRows, (row) => row.owner_id === id && row.status === "COMPLETED" && row.completed_at && new Date(row.completed_at) >= today.start && new Date(row.completed_at) <= today.end), remaining: count(taskRows, (row) => row.owner_id === id && ACTIVE_TASKS.includes(row.status) && row.due_at && new Date(row.due_at) >= today.start && new Date(row.due_at) <= today.end), overdue: count(taskRows, (row) => row.owner_id === id && ACTIVE_TASKS.includes(row.status) && row.due_at && new Date(row.due_at) < new Date()), active_leads: count(allScopedLeads, (row) => row.current_owner_id === id && !["CONVERTED", "LOST", "INVALID"].includes(String(row.status).toUpperCase())) }; });
  const attentionSummary = [...new Set(attentionRows.map((row) => row.attention_type))].map((type) => ({ attention_type: type, count: count(attentionRows, (row) => row.attention_type === type) }));
  return {
    timezone: TIMEZONE, generated_at: new Date().toISOString(), range: { preset: range.preset, start: range.start.toISOString(), end: range.end.toISOString() },
    kpis: { new_leads: count(leadRows, (row) => String(row.status).toUpperCase() === "NEW_LEAD" || String(row.status).toUpperCase() === "NEW"), assigned_leads: count(leadRows, (row) => Boolean(row.current_owner_id)), unassigned_leads: count(leadRows, (row) => !row.current_owner_id), tasks_due_today: dueToday, tasks_completed_today: completedToday, overdue_tasks: overdue, follow_ups_due: followUps, appointments_today: appointmentRows.length, appointments_completed_attended: count(appointmentRows, (row) => ["completed", "attended"].includes(row.status)), no_shows: count(appointmentRows, (row) => row.status === "no_show"), open_attention: attentionRows.length, lost_leads: count(leadRows, (row) => String(row.status).toUpperCase() === "LOST"), invalid_leads: count(leadRows, (row) => String(row.status).toUpperCase() === "INVALID") },
    lead_sources: [...leadSources.entries()].map(([source, value]) => ({ source, count: value })), service_breakdown: [...services.entries()].map(([service, value]) => ({ service, count: value })), team_summary: teamSummary, telecaller_summary: telecallerSummary,
    appointment_summary: { scheduled_today: count(appointmentRows, (row) => row.status === "scheduled"), confirmed_today: count(appointmentRows, (row) => row.status === "confirmed"), completed_attended: count(appointmentRows, (row) => ["completed", "attended"].includes(row.status)), no_show: count(appointmentRows, (row) => row.status === "no_show"), cancelled: count(appointmentRows, (row) => row.status === "cancelled") }, attention_summary: attentionSummary,
  };
};
