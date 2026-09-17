import db from "../../database/index.js";
import { getInclusiveDateRange } from "../../utils/dateTime.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";
import { Op } from "sequelize";
import { attemptSheetSync } from "../rio/rioSheetSync.service.js";

const RIO_CLIENT_MODULE_KEY = "rio";

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolveTenantWhere = async (tenant, requestedClientKey, filters = {}) => {
  const clientId = await resolveClientId({
    tenant,
    requestedClientKey,
    expectedModuleKey: RIO_CLIENT_MODULE_KEY,
  });

  return {
    ...tenant.getScope(filters),
    client_id: clientId,
  };
};

const normalizePayload = (data) => {
  const payload = { ...data };

  for (const field of [
    "registration_number",
    "parent_name",
    "child_name",
    "phone",
    "gender",
    "ip_address",
    "utm_source",
  ]) {
    if (typeof payload[field] === "string") {
      payload[field] = payload[field].trim();
    }
  }

  return payload;
};

const buildListWhere = (filters = {}) => {
  const { search, start_date, end_date } = filters;
  const where = {};

  if (search) {
    where[Op.or] = [
      { registration_number: { [Op.like]: `%${search}%` } },
      { parent_name: { [Op.like]: `%${search}%` } },
      { child_name: { [Op.like]: `%${search}%` } },
      { phone: { [Op.like]: `%${search}%` } },
      { utm_source: { [Op.like]: `%${search}%` } },
    ];
  }

  if (start_date || end_date) {
    const { start, end } = getInclusiveDateRange(start_date, end_date);
    where.created_at = {
      ...(start ? { [Op.gte]: start } : {}),
      ...(end ? { [Op.lte]: end } : {}),
    };
  }

  return where;
};

export const listVaccineChartLeads = async (filters, tenant) => {
  const requestedClientKey = filters?._client_key;
  const where = await resolveTenantWhere(tenant, requestedClientKey, buildListWhere(filters));
  const { page = 1, limit = 50 } = filters;
  const offset = (page - 1) * limit;

  const { rows, count } = await db.RioVaccineChart.findAndCountAll({
    where,
    order: [["created_at", "DESC"], ["id", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

export const getVaccineChartLeadById = async (id, tenant, requestedClientKey) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const record = await db.RioVaccineChart.findOne({ where });

  if (!record) {
    throw createHttpError(404, "Vaccine chart lead not found");
  }

  return record;
};

export const createVaccineChartLead = async (data, tenant, requestedClientKey) => {
  const tenantWhere = await resolveTenantWhere(tenant, requestedClientKey);

  return db.RioVaccineChart.create({
    ...normalizePayload(data),
    client_id: tenantWhere.client_id,
  });
};

export const createVaccineChartPublicLead = async (data, clientId) => {
  const record = await db.RioVaccineChart.create({
    ...normalizePayload(data),
    client_id: clientId,
  });

  // DB row is already committed; mirror into the Google Sheet next,
  // best-effort and non-blocking — the retry scheduler picks up failures.
  attemptSheetSync(record, "vaccine_chart").catch(() => {});

  return record;
};

export const updateVaccineChartLead = async (id, data, tenant, requestedClientKey) => {
  const record = await getVaccineChartLeadById(id, tenant, requestedClientKey);
  return record.update(normalizePayload(data));
};

export const deleteVaccineChartLead = async (id, tenant, requestedClientKey) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const deleted = await db.RioVaccineChart.destroy({ where });

  if (!deleted) {
    throw createHttpError(404, "Vaccine chart lead not found");
  }
};
