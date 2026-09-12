import { Op, fn, col, literal } from "sequelize";
import db from "../../database/index.js";
import { LEGACY_STATUS_TO_STAGE } from "../../database/tables/BirthwaveLeadTable/index.js";
import { getOperationalScope } from "./birthwavePermissions.service.js";

const ACTIVE_QUEUE_STATUSES = ["PENDING", "IN_PROGRESS"];
const TIMEZONE = "Asia/Kolkata";
const httpError = (status, message) => { const error = new Error(message); error.status = status; return error; };
const scoped = (clientId, extra = {}) => ({ client_id: clientId, ...extra });

const taskInclude = [
  {
    model: db.BirthwaveLead,
    as: "lead",
    required: true,
    include: [{ model: db.BirthwaveContact, as: "contact", required: false }],
  },
  { model: db.BirthwaveTeam, as: "team", required: true },
  { model: db.Management, as: "owner", required: true, attributes: ["id", "username", "email", "role"] },
];

const localDateParts = (date) => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
);

const operationalDay = (now = new Date()) => {
  const parts = localDateParts(now);
  const start = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
  return { start, next: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

const activeWhere = { status: { [Op.in]: ACTIVE_QUEUE_STATUSES } };
const isOverdue = (dueAt, now) => new Date(dueAt).getTime() < now.getTime();
const isActive = (status) => ACTIVE_QUEUE_STATUSES.includes(status);

const taskLabel = (value) => String(value || "").replace(/_/g, " ");
const contactName = (task) => task.lead?.contact?.display_name || task.lead?.name || "Unknown customer";
const phone = (task) => task.lead?.contact?.normalized_phone || task.lead?.phone || null;
const email = (task) => task.lead?.contact?.normalized_email || task.lead?.email || null;

const compactActivity = (activity) => activity ? ({
  id: activity.id,
  event_type: activity.event_type,
  title: activity.title,
  description: activity.description,
  author: activity.actor_name || null,
  timestamp: activity.occurred_at,
}) : null;

const compactTask = (task, now, activityByLead) => {
  const activities = activityByLead.get(Number(task.lead_id)) || [];
  const note = activities.find((activity) => activity.event_type === "note_added") || null;
  const latest = activities[0] || null;
  return {
    task_id: task.id,
    task_type: task.task_type,
    task_status: task.status,
    priority: task.priority,
    due_at: task.due_at,
    is_overdue: isActive(task.status) && isOverdue(task.due_at, now),
    lead_id: task.lead_id,
    lead_stage: LEGACY_STATUS_TO_STAGE[task.lead?.status] || String(task.lead?.status || "NEW").toUpperCase(),
    customer_name: contactName(task),
    phone: phone(task),
    email: email(task),
    service: task.lead?.service || null,
    source: task.lead?.source || null,
    team: task.team ? { id: task.team.id, name: task.team.name, code: task.team.code } : null,
    owner: task.owner ? { id: task.owner.id, username: task.owner.username, email: task.owner.email } : null,
    last_note: note ? { text: note.description, author: note.actor_name || null, timestamp: note.occurred_at } : null,
    last_activity: compactActivity(latest),
    started_at: task.started_at,
    primary_next_action: Boolean(task.is_primary && isActive(task.status)),
  };
};

const addSearch = (where, search) => {
  const value = String(search || "").trim();
  if (!value) return;
  const terms = [
    { "$lead.name$": { [Op.like]: `%${value}%` } },
    { "$lead.phone$": { [Op.like]: `%${value}%` } },
    { "$lead.email$": { [Op.like]: `%${value}%` } },
    { "$lead->contact.display_name$": { [Op.like]: `%${value}%` } },
    { "$lead->contact.normalized_phone$": { [Op.like]: `%${value}%` } },
  ];
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) terms.push({ lead_id: numeric });
  where[Op.and] = [...(where[Op.and] || []), { [Op.or]: terms }];
};

const visibilityWhere = async (tenantId, actor, mode, query) => {
  const visibility = await getOperationalScope(tenantId, actor);
  const where = scoped(tenantId);
  if (mode === "my") {
    const ownerId = Number(actor?.id);
    if (!ownerId) throw httpError(403, "Authenticated user identity is required");
    where.owner_id = ownerId;
    return { where, visibility };
  }
  if (visibility.isAdmin) {
    if (query.team_id) where.team_id = Number(query.team_id);
    if (query.owner_id) where.owner_id = Number(query.owner_id);
    return { where, visibility };
  }
  if (visibility.ownerOnly || !visibility.isManager) throw httpError(403, "Only Team Managers and administrators can view Team Work");
  const allowedTeams = visibility.teamIds;
  if (query.team_id) {
    const teamId = Number(query.team_id);
    if (!allowedTeams.includes(teamId)) throw httpError(403, "You do not have access to this Team");
    where.team_id = teamId;
  } else {
    where.team_id = { [Op.in]: allowedTeams.length ? allowedTeams : [-1] };
  }
  if (query.owner_id) where.owner_id = Number(query.owner_id);
  return { where, visibility };
};

const withCommonFilters = (where, query) => {
  const result = { ...where, ...activeWhere };
  if (query.task_type) result.task_type = query.task_type;
  if (query.priority) result.priority = query.priority;
  addSearch(result, query.search);
  return result;
};

const sectionWhere = (base, section, now, day) => {
  const where = { ...base };
  if (section === "NOW") where.due_at = { [Op.lte]: now };
  if (section === "TODAY") where.due_at = { [Op.gt]: now, [Op.lt]: day.next };
  if (section === "FOLLOW_UPS") where.task_type = "FOLLOW_UP";
  if (section === "RETRIES") where.task_type = "RETRY_CALL";
  if (section === "UPCOMING") where.due_at = { [Op.gte]: day.next };
  if (section === "OVERDUE") where.due_at = { [Op.lt]: now };
  return where;
};

const orderForSection = (section) => {
  const order = [
    [literal("CASE WHEN priority = 'HIGH' THEN 0 ELSE 1 END"), "ASC"],
    ["due_at", "ASC"],
    ["created_at", "ASC"],
    ["id", "ASC"],
  ];
  if (section === "NOW") order.unshift([literal("CASE WHEN due_at < NOW() THEN 0 ELSE 1 END"), "ASC"]);
  return order;
};

const activitiesFor = async (tenantId, rows) => {
  const leadIds = [...new Set(rows.map((row) => Number(row.lead_id)).filter(Boolean))];
  if (!leadIds.length) return new Map();
  const activities = await db.BirthwaveLeadActivity.findAll({
    where: scoped(tenantId, { lead_id: { [Op.in]: leadIds } }),
    order: [["occurred_at", "DESC"], ["id", "DESC"]],
    attributes: ["id", "lead_id", "event_type", "title", "description", "actor_name", "occurred_at"],
  });
  const map = new Map();
  activities.forEach((activity) => {
    const key = Number(activity.lead_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(activity);
  });
  return map;
};

const fetchSection = async ({ tenantId, baseWhere, query, section, now, day }) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const where = sectionWhere(withCommonFilters(baseWhere, query), section, now, day);
  const { rows, count } = await db.BirthwaveTask.findAndCountAll({
    where,
    include: taskInclude,
    order: orderForSection(section),
    limit,
    offset: (page - 1) * limit,
    distinct: true,
    subQuery: false,
  });
  const activityByLead = await activitiesFor(tenantId, rows);
  return {
    tasks: rows.map((row) => compactTask(row, now, activityByLead)),
    pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) || 1 },
  };
};

const groupedCount = async (where, condition, field) => {
  const rows = await db.BirthwaveTask.findAll({
    attributes: [field, [fn("COUNT", col("id")), "count"]],
    where: { ...where, ...condition },
    group: [field],
    raw: true,
  });
  return new Map(rows.map((row) => [Number(row[field]), Number(row.count || 0)]));
};

const teamWorkSummary = async (where, now, day) => {
  const today = { status: { [Op.in]: ACTIVE_QUEUE_STATUSES }, due_at: { [Op.gt]: now, [Op.lt]: day.next } };
  const overdue = { status: { [Op.in]: ACTIVE_QUEUE_STATUSES }, due_at: { [Op.lt]: now } };
  const completed = { status: "COMPLETED", completed_at: { [Op.gte]: day.start, [Op.lt]: day.next } };
  const [todayCounts, overdueCounts, completedCounts] = await Promise.all([
    groupedCount(where, today, "owner_id"),
    groupedCount(where, overdue, "owner_id"),
    groupedCount(where, completed, "owner_id"),
  ]);
  const memberWhere = scoped(where.client_id, { status: { [Op.ne]: "INACTIVE" } });
  if (where.team_id) memberWhere.team_id = where.team_id;
  if (where.owner_id) memberWhere.management_id = where.owner_id;
  const memberRows = await db.BirthwaveTeamMember.findAll({
    where: memberWhere,
    attributes: ["management_id"],
    raw: true,
  });
  const ownerIds = [...new Set([
    ...memberRows.map((row) => Number(row.management_id)),
    ...todayCounts.keys(),
    ...overdueCounts.keys(),
    ...completedCounts.keys(),
  ])].filter(Boolean);
  const owners = ownerIds.length ? await db.Management.findAll({ where: { id: { [Op.in]: ownerIds } }, attributes: ["id", "username", "email"], raw: true }) : [];
  const ownerMap = new Map(owners.map((owner) => [Number(owner.id), owner]));
  const allOwnerIds = [...new Set(ownerIds)];
  const byOwner = allOwnerIds.map((ownerId) => ({
    owner: ownerMap.get(ownerId) || { id: ownerId, username: `User ${ownerId}`, email: null },
    today: todayCounts.get(ownerId) || 0,
    completed: completedCounts.get(ownerId) || 0,
    remaining: todayCounts.get(ownerId) || 0,
    overdue: overdueCounts.get(ownerId) || 0,
  })).sort((a, b) => String(a.owner.username).localeCompare(String(b.owner.username)));
  return { by_owner: byOwner };
};

const buildWorkResponse = async (tenant, query, actor, mode) => {
  const { where } = await visibilityWhere(tenant.id, actor, mode, query);
  const now = new Date();
  const day = operationalDay(now);
  const sections = ["NOW", "TODAY", "FOLLOW_UPS", "RETRIES", "UPCOMING", "OVERDUE"];
  const sectionData = {};
  for (const section of sections) sectionData[section] = await fetchSection({ tenantId: tenant.id, baseWhere: where, query, section, now, day });
  const common = withCommonFilters(where, query);
  const counts = {
    due_today: sectionData.TODAY.pagination.total,
    follow_ups: sectionData.FOLLOW_UPS.pagination.total,
    retries: sectionData.RETRIES.pagination.total,
    overdue: sectionData.OVERDUE.pagination.total,
  };
  const payload = {
    timezone: TIMEZONE,
    generated_at: now,
    sections: sectionData,
    counts,
  };
  if (mode === "team") {
    const summaryWhere = { ...where };
    if (query.task_type) summaryWhere.task_type = query.task_type;
    if (query.priority) summaryWhere.priority = query.priority;
    payload.summary = await teamWorkSummary(summaryWhere, now, day);
  }
  return payload;
};

export const getMyWork = (tenant, query, actor) => buildWorkResponse(tenant, query, actor, "my");
export const getTeamWork = (tenant, query, actor) => buildWorkResponse(tenant, query, actor, "team");

export default { getMyWork, getTeamWork };
