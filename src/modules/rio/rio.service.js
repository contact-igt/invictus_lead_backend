import PDFDocument from "pdfkit";
import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";
import { getInclusiveDateRange, getMonthBounds, getTodayBounds } from "../../utils/dateTime.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";

const RIO_CLIENT_KEY = "rio";
const IST_TIMEZONE = "Asia/Kolkata";
const PDF_EMPTY_VALUE = "\u2014";
const CSV_HEADERS = [
  "S.No",
  "Name",
  "Mobile Number",
  "Service",
  "Branch",
  "Message",
  "IP Address",
  "UTM Source",
  "Created At",
  "Updated At",
];
const PDF_COLUMNS = [
  { key: "serialNumber", label: "S.No", width: 40, align: "center" },
  { key: "name", label: "Name", width: 130 },
  { key: "mobile_number", label: "Mobile", width: 90 },
  { key: "service", label: "Service", width: 140 },
  { key: "ip_address", label: "IP Address", width: 100 },
  { key: "utm_source", label: "UTM Source", width: 110 },
  { key: "created_at", label: "Created At", width: 92 },
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
    expectedModuleKey: RIO_CLIENT_KEY,
  });

  return {
    ...tenant.getScope(filters),
    client_id: clientId,
  };
};

const normalizePayload = (data) => {
  const payload = { ...data };

  for (const field of [
    "name",
    "mobile_number",
    "service",
    "branch",
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

const getIstRangeBounds = () => {
  const { now, start: todayStart } = getTodayBounds();
  const { start: monthStart } = getMonthBounds();
  return { now, todayStart, monthStart };
};

const buildLeadFilters = (filters = {}) => {
  const {
    search,
    service,
    branch,
    utm_source,
    start_date,
    end_date,
  } = filters;

  const queryFilters = {};

  if (search) {
    queryFilters[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { mobile_number: { [Op.like]: `%${search}%` } },
      { service: { [Op.like]: `%${search}%` } },
      { branch: { [Op.like]: `%${search}%` } },
      { message: { [Op.like]: `%${search}%` } },
      { utm_source: { [Op.like]: `%${search}%` } },
    ];
  }

  if (service) queryFilters.service = service;
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

const buildLeadWhere = async (filters, tenant) => {
  const requestedClientKey = filters?._client_key;
  const queryFilters = buildLeadFilters(filters);

  return resolveTenantWhere(tenant, requestedClientKey, queryFilters);
};

const buildLeadAttributes = () => [
  "id",
  "name",
  "mobile_number",
  "service",
  "branch",
  "message",
  "ip_address",
  "utm_source",
  "created_at",
  "updated_at",
];

const listLeadRows = async (filters, tenant, options = {}) => {
  const where = await buildLeadWhere(filters, tenant);
  const query = {
    where,
    order: [["created_at", "DESC"], ["id", "DESC"]],
    attributes: buildLeadAttributes(),
  };

  if (options.paginate) {
    query.limit = options.limit;
    query.offset = options.offset;
    return db.Rio.findAndCountAll({
      ...query,
      distinct: true,
    });
  }

  return db.Rio.findAll(query);
};

const formatExportTimestamp = (value) => {
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

const formatFileDateStamp = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const formatGeneratedAt = (value = new Date()) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);

const formatDateRangeLabel = (startDate, endDate) => {
  if (startDate && endDate) {
    return `${formatExportTimestamp(startDate)} to ${formatExportTimestamp(endDate)}`;
  }
  if (startDate) return `From ${formatExportTimestamp(startDate)}`;
  if (endDate) return `Until ${formatExportTimestamp(endDate)}`;
  return null;
};

const mapLeadToExportRow = (lead, index) => ({
  serialNumber: index + 1,
  name: lead.name || "",
  mobile_number: lead.mobile_number || "",
  service: lead.service || "",
  branch: lead.branch || "",
  message: lead.message || "",
  ip_address: lead.ip_address || "",
  utm_source: lead.utm_source || "",
  created_at: formatExportTimestamp(lead.created_at),
  updated_at: formatExportTimestamp(lead.updated_at),
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
        row.service,
        row.branch,
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

const drawPdfPageNumber = (doc, pageNumber) => {
  doc
    .fontSize(9)
    .fillColor("#6B7280")
    .text(`Page ${pageNumber}`, doc.page.margins.left, doc.page.height - 28, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "right",
    });
};

const buildPdfFilterSummary = (filters) => {
  const lines = [];

  if (filters.search) lines.push(`Search: ${filters.search}`);
  if (filters.service) lines.push(`Service: ${filters.service}`);
  if (filters.branch) lines.push(`Branch: ${filters.branch}`);
  if (filters.utm_source) lines.push(`UTM Source: ${filters.utm_source}`);

  const dateRange = formatDateRangeLabel(filters.start_date, filters.end_date);
  if (dateRange) lines.push(`Date Range: ${dateRange}`);

  return lines;
};

const buildPdfBuffer = async (rows, filters) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      bufferPages: true,
    });
    const chunks = [];
    const filterLines = buildPdfFilterSummary(filters);
    let pageNumber = 1;

    const drawTableHeader = (y) => {
      const headerHeight = 22;
      let x = doc.page.margins.left;

      doc.save();
      doc.rect(x, y, 0, 0);
      doc.restore();
      doc.fillColor("#E8F1F5");
      doc.rect(
        doc.page.margins.left,
        y,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        headerHeight,
      ).fill();

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0F172A");
      PDF_COLUMNS.forEach((column) => {
        doc.text(column.label, x + 4, y + 7, {
          width: column.width - 8,
          align: column.align || "left",
        });
        x += column.width;
      });

      doc.moveTo(doc.page.margins.left, y + headerHeight)
        .lineTo(doc.page.width - doc.page.margins.right, y + headerHeight)
        .strokeColor("#CBD5E1")
        .lineWidth(1)
        .stroke();

      return y + headerHeight;
    };

    const drawPageFrame = (includeFilters = false) => {
      let y = doc.page.margins.top;

      doc.font("Helvetica-Bold").fontSize(16).fillColor("#0F172A").text(
        "Rio - Lead Report",
        doc.page.margins.left,
        y,
      );
      y += 22;

      doc.font("Helvetica").fontSize(10).fillColor("#475569").text(
        `Generated on: ${formatGeneratedAt()}`,
        doc.page.margins.left,
        y,
      );
      y += 18;

      if (includeFilters && filterLines.length > 0) {
        filterLines.forEach((line) => {
          doc.text(line, doc.page.margins.left, y, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          });
          y += 14;
        });
        y += 4;
      }

      return drawTableHeader(y + 8) + 8;
    };

    const getRowHeight = (row) => {
      doc.font("Helvetica").fontSize(8.5);
      const heights = PDF_COLUMNS.map((column) => {
        const rawValue = row[column.key];
        const value = rawValue ? String(rawValue) : PDF_EMPTY_VALUE;
        return doc.heightOfString(value, {
          width: column.width - 10,
          align: column.align || "left",
        });
      });

      return Math.max(22, Math.ceil(Math.max(...heights)) + 10);
    };

    const drawRow = (row, y, height) => {
      let x = doc.page.margins.left;

      doc.rect(
        doc.page.margins.left,
        y,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        height,
      ).strokeColor("#E2E8F0").lineWidth(1).stroke();

      doc.font("Helvetica").fontSize(8.5).fillColor("#111827");
      PDF_COLUMNS.forEach((column) => {
        const rawValue = row[column.key];
        const value = rawValue ? String(rawValue) : PDF_EMPTY_VALUE;
        doc.text(value, x + 4, y + 6, {
          width: column.width - 8,
          align: column.align || "left",
        });
        x += column.width;
      });
    };

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = drawPageFrame(true);
    const maxY = doc.page.height - doc.page.margins.bottom - 26;

    if (rows.length === 0) {
      doc.font("Helvetica").fontSize(11).fillColor("#475569").text(
        "No records found for the selected filters.",
        doc.page.margins.left,
        y + 16,
      );
      drawPdfPageNumber(doc, pageNumber);
      doc.end();
      return;
    }

    rows.forEach((row, index) => {
      const rowHeight = getRowHeight(row);
      if (y + rowHeight > maxY) {
        drawPdfPageNumber(doc, pageNumber);
        doc.addPage();
        pageNumber += 1;
        y = drawPageFrame(false);
      }

      drawRow(row, y, rowHeight);
      y += rowHeight;

      if (index === rows.length - 1) {
        drawPdfPageNumber(doc, pageNumber);
      }
    });

    doc.end();
  });

export const listRioLeads = async (filters, tenant) => {
  const {
    page = 1,
    limit = 20,
  } = filters;

  const offset = (page - 1) * limit;
  const { rows, count } = await listLeadRows(filters, tenant, {
    paginate: true,
    limit,
    offset,
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

export const exportRioLeadReport = async (filters, tenant) => {
  const rows = await listLeadRows(filters, tenant);
  const exportRows = rows.map((row, index) => mapLeadToExportRow(row, index));
  const fileDate = formatFileDateStamp();

  if (filters.format === "pdf") {
    return {
      buffer: await buildPdfBuffer(exportRows, filters),
      contentType: "application/pdf",
      filename: `rio-leads-${fileDate}.pdf`,
    };
  }

  return {
    buffer: buildCsvBuffer(exportRows),
    contentType: "text/csv; charset=utf-8",
    filename: `rio-leads-${fileDate}.csv`,
  };
};

export const getRioSummary = async (filters, tenant) => {
  const where = await buildLeadWhere(filters, tenant);
  const { now, todayStart, monthStart } = getIstRangeBounds();

  const [totalLeads, todayLeads, thisMonthLeads, topServiceRow] = await Promise.all([
    db.Rio.count({ where }),
    db.Rio.count({
      where: {
        ...where,
        created_at: {
          [Op.gte]: todayStart,
          [Op.lte]: now,
        },
      },
    }),
    db.Rio.count({
      where: {
        ...where,
        created_at: {
          [Op.gte]: monthStart,
          [Op.lte]: now,
        },
      },
    }),
    db.Rio.findOne({
      attributes: ["service", [fn("COUNT", col("service")), "service_count"]],
      where: {
        ...where,
        service: {
          [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
        },
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

export const getRioLeadById = async (
  id,
  tenant,
  requestedClientKey,
) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const record = await db.Rio.findOne({ where });

  if (!record) {
    throw createHttpError(404, "Rio lead not found");
  }

  return record;
};

export const createRioLead = async (
  data,
  tenant,
  requestedClientKey,
) => {
  const tenantWhere = await resolveTenantWhere(tenant, requestedClientKey);

  return db.Rio.create({
    ...normalizePayload(data),
    client_id: tenantWhere.client_id,
  });
};

export const createRioPublicLead = async (data, clientId) =>
  db.Rio.create({
    ...normalizePayload(data),
    client_id: clientId,
  });

export const updateRioLead = async (
  id,
  data,
  tenant,
  requestedClientKey,
) => {
  const record = await getRioLeadById(
    id,
    tenant,
    requestedClientKey,
  );
  return record.update(normalizePayload(data));
};

export const deleteRioLead = async (
  id,
  tenant,
  requestedClientKey,
) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const deleted = await db.Rio.destroy({ where });

  if (!deleted) {
    throw createHttpError(404, "Rio lead not found");
  }
};


