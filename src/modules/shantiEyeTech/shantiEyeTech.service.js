import PDFDocument from "pdfkit";
import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";
import { getInclusiveDateRange, getMonthBounds, getTodayBounds } from "../../utils/dateTime.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";
import { escapeCsvValue } from "../../utils/csv.js";
import { withCreatedAtRange } from "../../utils/sequelizeFilters.js";

const SHANTI_EYE_TECH_CLIENT_KEY = "shanti_eye_tech";
const IST_TIMEZONE = "Asia/Kolkata";
const LEAD_ATTRIBUTES = [
  "id",
  "name",
  "mobile_number",
  "service",
  "message",
  "ip_address",
  "utm_source",
  "created_at",
  "updated_at",
];
const CSV_HEADERS = [
  "S.No",
  "Name",
  "Mobile Number",
  "Service",
  "Message",
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
  const clientId = await resolveClientId({
    tenant,
    requestedClientKey,
    expectedModuleKey: SHANTI_EYE_TECH_CLIENT_KEY,
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
    "service",
    "message",
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
  const { search, service, utm_source, start_date, end_date } = filters;
  const queryFilters = {};

  if (search) {
    queryFilters[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { mobile_number: { [Op.like]: `%${search}%` } },
      { service: { [Op.like]: `%${search}%` } },
      { message: { [Op.like]: `%${search}%` } },
      { utm_source: { [Op.like]: `%${search}%` } },
    ];
  }

  if (service) queryFilters.service = service;
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
    return db.ShantiEyeTech.findAndCountAll({
      ...query,
      distinct: true,
      limit: options.limit,
      offset: options.offset,
    });
  }

  return db.ShantiEyeTech.findAll(query);
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
  service: lead.service || "",
  message: lead.message || "",
  ip_address: lead.ip_address || "",
  utm_source: lead.utm_source || "",
  created_at: formatTimestamp(lead.created_at),
  updated_at: formatTimestamp(lead.updated_at),
});

const buildCsvBuffer = (rows) => {
  const lines = [CSV_HEADERS.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.serialNumber,
        row.name,
        row.mobile_number,
        row.service,
        row.message,
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

    doc.font("Helvetica-Bold").fontSize(16).text("Shanti Eye Tech - Lead Report");
    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#475569")
      .text(`Generated on: ${formatTimestamp(new Date())}`);

    const filterParts = [];
    if (filters.search) filterParts.push(`Search: ${filters.search}`);
    if (filters.service) filterParts.push(`Service: ${filters.service}`);
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
        `Service: ${row.service || "-"}`,
        `Message: ${row.message || "-"}`,
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

export const listShantiEyeTechLeads = async (filters, tenant) => {
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

export const exportShantiEyeTechLeadReport = async (filters, tenant) => {
  const leads = await listLeadRows(filters, tenant);
  const rows = leads.map(mapExportRow);
  const fileDate = formatFileDate();

  if (filters.format === "pdf") {
    return {
      buffer: await buildPdfBuffer(rows, filters),
      contentType: "application/pdf",
      filename: `shanti-eye-tech-leads-${fileDate}.pdf`,
    };
  }

  return {
    buffer: buildCsvBuffer(rows),
    contentType: "text/csv; charset=utf-8",
    filename: `shanti-eye-tech-leads-${fileDate}.csv`,
  };
};

export const getShantiEyeTechSummary = async (filters, tenant) => {
  const where = await buildLeadWhere(filters, tenant);
  const { now, todayStart, monthStart } = getIstRangeBounds();

  const [totalLeads, todayLeads, thisMonthLeads, topServiceRow] =
    await Promise.all([
      db.ShantiEyeTech.count({ where }),
      db.ShantiEyeTech.count({
        where: withCreatedAtRange(where, todayStart, now),
      }),
      db.ShantiEyeTech.count({
        where: withCreatedAtRange(where, monthStart, now),
      }),
      db.ShantiEyeTech.findOne({
        attributes: ["service", [fn("COUNT", col("service")), "service_count"]],
        where: {
          ...where,
          service: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
        },
        group: ["service"],
        order: [[fn("COUNT", col("service")), "DESC"], ["service", "ASC"]],
        raw: true,
      }),
    ]);

  return {
    total_leads: totalLeads,
    today_leads: todayLeads,
    this_month_leads: thisMonthLeads,
    top_service: topServiceRow?.service || null,
    top_service_count: Number(topServiceRow?.service_count || 0),
  };
};

export const getShantiEyeTechLeadById = async (
  id,
  tenant,
  requestedClientKey,
) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const record = await db.ShantiEyeTech.findOne({ where });

  if (!record) throw createHttpError(404, "Shanti Eye Tech lead not found");
  return record;
};

export const createShantiEyeTechPublicLead = async (data, clientId) =>
  db.ShantiEyeTech.create({
    ...normalizePayload(data),
    client_id: clientId,
  });

export const createShantiEyeTechLead = async (
  data,
  tenant,
  requestedClientKey,
) => {
  const tenantWhere = await resolveTenantWhere(tenant, requestedClientKey);
  return db.ShantiEyeTech.create({
    ...normalizePayload(data),
    client_id: tenantWhere.client_id,
  });
};

export const updateShantiEyeTechLead = async (
  id,
  data,
  tenant,
  requestedClientKey,
) => {
  const record = await getShantiEyeTechLeadById(id, tenant, requestedClientKey);
  return record.update(normalizePayload(data));
};

export const deleteShantiEyeTechLead = async (
  id,
  tenant,
  requestedClientKey,
) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const deleted = await db.ShantiEyeTech.destroy({ where });
  if (!deleted) throw createHttpError(404, "Shanti Eye Tech lead not found");
};
