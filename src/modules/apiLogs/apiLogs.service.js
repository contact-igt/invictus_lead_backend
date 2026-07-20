import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";

const buildWhere = (filters) => {
  const where = {};
  if (filters.method) where.method = String(filters.method).toUpperCase();
  if (filters.status) where.status_code = Number(filters.status);
  if (filters.user_id) where.user_id = Number(filters.user_id);
  if (filters.client_id) where.client_id = Number(filters.client_id);
  if (filters.path) where.path = { [Op.like]: `%${String(filters.path).trim()}%` };
  if (filters.start_date || filters.end_date) {
    where.created_at = {
      ...(filters.start_date ? { [Op.gte]: new Date(filters.start_date) } : {}),
      ...(filters.end_date ? { [Op.lte]: new Date(`${filters.end_date}T23:59:59.999Z`) } : {}),
    };
  }
  return where;
};

export const listApiLogs = async (filters = {}) => {
  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
  const where = buildWhere(filters);
  const { rows, count } = await db.ApiLog.findAndCountAll({
    where,
    order: [["created_at", "DESC"], ["id", "DESC"]],
    limit,
    offset: (page - 1) * limit,
    attributes: { exclude: ["request_body", "response_body"] },
  });
  return { data: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

export const getApiLog = (id) => db.ApiLog.findByPk(id);

export const getApiLogSummary = async (filters = {}) => {
  const where = buildWhere(filters);
  const [total, errors, avgRow, routes] = await Promise.all([
    db.ApiLog.count({ where }),
    db.ApiLog.count({ where: { ...where, status_code: { [Op.gte]: 400 } } }),
    db.ApiLog.findOne({ attributes: [[fn("AVG", col("duration_ms")), "avg_duration_ms"]], where, raw: true }),
    db.ApiLog.findAll({
      attributes: ["path", [fn("COUNT", col("id")), "count"]],
      where,
      group: ["path"],
      order: [[fn("COUNT", col("id")), "DESC"]],
      limit: 5,
      raw: true,
    }),
  ]);
  return { total_requests: total, failed_requests: errors, average_duration_ms: Math.round(Number(avgRow?.avg_duration_ms || 0)), top_routes: routes };
};
