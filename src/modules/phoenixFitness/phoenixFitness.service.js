import PDFDocument from "pdfkit";
import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";
import { getInclusiveDateRange, getMonthBounds, getTodayBounds } from "../../utils/dateTime.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";

const PHOENIX_FITNESS_CLIENT_KEY = "phoenix_fitness";
const IST_TIMEZONE = "Asia/Kolkata";
const LEAD_ATTRIBUTES = [
  "id",
  "name",
  "mobile_number",
  "branch",
  "ip_address",
  "utm_source",
  "created_at",
  "updated_at",
];
const CSV_HEADERS = [
  "S.No",
  "Name",
  "Mobile Number",
  "Branch",
  "IP Address",
  "UTM Source",
  "Created At",
  "Updated At",
];

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolveTenantWhere = async (tenant, requestedClientKey, filters = {}) => {
  if (!tenant?.isSuperAdmin) {
    if (!tenant?.id) {
      throw createHttpError(403, "A valid tenant context is required");
    }
    return tenant.getScope(filters);
  }

  const clientId = await resolveClientId({
    tenant,
    requestedClientKey,
    expectedModuleKey: PHOENIX_FITNESS_CLIENT_KEY,
  });

  return {
    ...tenant.getScope(filters),
    client_id: clientId,
  };
};

const normalizePayload = (data) => {
  const payload = { ...data };
  delete payload.client_key;
  delete payload._client_key;

  for (const field of [
    "name",
    "mobile_number",
    "branch",
    "ip_address",
    "utm_source",
  ]) {
    if (typeof payload[field] === "string") {
      payload[field] = payload[field].trim();
    }
  }

  return payload;
};

const buildLeadFilters = (filters = {}) => {
  const { search, branch, utm_source, start_date, end_date } = filters;
  const queryFilters = {};

  if (search) {
    queryFilters[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { mobile_number: { [Op.like]: `%${search}%` } },
      { branch: { [Op.like]: `%${search}%` } },
      { utm_source: { [Op.like]: `%${search}%` } },
    ];
  }

  if (branch) queryFilters.branch = branch;
  if (utm_source) queryFilters.utm_source = utm_source;

  if (start_date || end_date) {
    const { start, end } = getInclusiveDateRange(start_date, end_date);
    queryFilters.created_at = {
      ...(start ? { [Op.gte]: start } : {}),
      ...(end ? { [Op.lte]: end } : {}),
    };
  }

  return queryFilters;
};

const buildLeadWhere = (filters, tenant) =>
  resolveTenantWhere(
    tenant,
    filters?._client_key,
    buildLeadFilters(filters),
  );

const listLeadRows = async (filters, tenant, options = {}) => {
  const query = {
    where: await buildLeadWhere(filters, tenant),
    order: [["created_at", "DESC"]],
    attributes: LEAD_ATTRIBUTES,
  };

  if (options.paginate) {
    return db.PhoenixFitness.findAndCountAll({
      ...query,
      distinct: true,
      limit: options.limit,
      offset: options.offset,
    });
  }

  return db.PhoenixFitness.findAll(query);
};

const formatTimestamp = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

const formatFileDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const mapExportRow = (lead, index) => ({
  serialNumber: index + 1,
  name: lead.name || "",
  mobile_number: lead.mobile_number || "",
  branch: lead.branch || "",
  ip_address: lead.ip_address || "",
  utm_source: lead.utm_source || "",
  created_at: formatTimestamp(lead.created_at),
  updated_at: formatTimestamp(lead.updated_at),
});

const escapeCsvValue = (value) => {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

const buildCsvBuffer = (rows) => {
  const lines = [CSV_HEADERS.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.serialNumber,
        row.name,
        row.mobile_number,
        row.branch,
        row.ip_address,
        row.utm_source,
        row.created_at,
        row.updated_at,
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return Buffer.from(`\uFEFF${lines.join("\r\n")}`, "utf8");
};

const buildPdfBuffer = async (rows, filters) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text("Phoenix Fitness - Lead Report");
    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#475569")
      .text(`Generated on: ${formatTimestamp(new Date())}`);

    const filterParts = [];
    if (filters.search) filterParts.push(`Search: ${filters.search}`);
    if (filters.branch) filterParts.push(`Branch: ${filters.branch}`);
    if (filters.utm_source) filterParts.push(`UTM Source: ${filters.utm_source}`);
    if (filters.start_date) filterParts.push(`From: ${filters.start_date}`);
    if (filters.end_date) filterParts.push(`To: ${filters.end_date}`);
    if (filterParts.length) doc.text(filterParts.join(" | "));

    doc.moveDown();

    if (!rows.length) {
      doc.fillColor("#111827").fontSize(11).text("No records found.");
      doc.end();
      return;
    }

    rows.forEach((row) => {
      const summary = [
        `${row.serialNumber}. ${row.name || "-"}`,
        `Mobile: ${row.mobile_number || "-"}`,
        `Branch: ${row.branch || "-"}`,
        `IP: ${row.ip_address || "-"}`,
        `UTM: ${row.utm_source || "-"}`,
        `Created: ${row.created_at || "-"}`,
      ].join("\n");

      const requiredHeight = doc.heightOfString(summary, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
      if (doc.y + requiredHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }

      doc.font("Helvetica").fontSize(9).fillColor("#111827").text(summary);
      doc.moveDown(0.6);
      doc
        .strokeColor("#E2E8F0")
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.6);
    });

    doc.end();
  });

const getIstRangeBounds = () => {
  const { now, start: todayStart } = getTodayBounds();
  const { start: monthStart } = getMonthBounds();
  return { now, todayStart, monthStart };
};

export const listPhoenixFitnessLeads = async (filters, tenant) => {
  const { page = 1, limit = 20 } = filters;
  const { rows, count } = await listLeadRows(filters, tenant, {
    paginate: true,
    limit,
    offset: (page - 1) * limit,
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

export const exportPhoenixFitnessLeadReport = async (filters, tenant) => {
  const leads = await listLeadRows(filters, tenant);
  const rows = leads.map(mapExportRow);
  const fileDate = formatFileDate();

  if (filters.format === "pdf") {
    return {
      buffer: await buildPdfBuffer(rows, filters),
      contentType: "application/pdf",
      filename: `phoenix-fitness-leads-${fileDate}.pdf`,
    };
  }

  return {
    buffer: buildCsvBuffer(rows),
    contentType: "text/csv; charset=utf-8",
    filename: `phoenix-fitness-leads-${fileDate}.csv`,
  };
};

export const getPhoenixFitnessSummary = async (filters, tenant) => {
  const where = await buildLeadWhere(filters, tenant);
  const { now, todayStart, monthStart } = getIstRangeBounds();

  const [totalLeads, todayLeads, thisMonthLeads, topBranchRow] =
    await Promise.all([
      db.PhoenixFitness.count({ where }),
      db.PhoenixFitness.count({
        where: {
          ...where,
          created_at: { [Op.gte]: todayStart, [Op.lte]: now },
        },
      }),
      db.PhoenixFitness.count({
        where: {
          ...where,
          created_at: { [Op.gte]: monthStart, [Op.lte]: now },
        },
      }),
      db.PhoenixFitness.findOne({
        attributes: ["branch", [fn("COUNT", col("branch")), "branch_count"]],
        where: {
          ...where,
          branch: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
        },
        group: ["branch"],
        order: [[fn("COUNT", col("branch")), "DESC"], ["branch", "ASC"]],
        raw: true,
      }),
    ]);

  return {
    total_leads: totalLeads,
    today_leads: todayLeads,
    this_month_leads: thisMonthLeads,
    top_branch: topBranchRow?.branch || null,
    top_branch_count: Number(topBranchRow?.branch_count || 0),
  };
};

export const getPhoenixFitnessLeadById = async (
  id,
  tenant,
  requestedClientKey,
) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const record = await db.PhoenixFitness.findOne({ where });

  if (!record) throw createHttpError(404, "Phoenix Fitness lead not found");
  return record;
};

export const createPhoenixFitnessPublicLead = async (data, clientId) =>
  db.PhoenixFitness.create({
    ...normalizePayload(data),
    client_id: clientId,
  });

export const createPhoenixFitnessLead = async (
  data,
  tenant,
  requestedClientKey,
) => {
  const tenantWhere = await resolveTenantWhere(tenant, requestedClientKey);
  return db.PhoenixFitness.create({
    ...normalizePayload(data),
    client_id: tenantWhere.client_id,
  });
};

export const updatePhoenixFitnessLead = async (
  id,
  data,
  tenant,
  requestedClientKey,
) => {
  const record = await getPhoenixFitnessLeadById(id, tenant, requestedClientKey);
  return record.update(normalizePayload(data));
};

export const deletePhoenixFitnessLead = async (
  id,
  tenant,
  requestedClientKey,
) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const deleted = await db.PhoenixFitness.destroy({ where });
  if (!deleted) throw createHttpError(404, "Phoenix Fitness lead not found");
};
