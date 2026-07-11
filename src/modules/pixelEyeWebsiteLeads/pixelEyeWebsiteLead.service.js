import PDFDocument from "pdfkit";
import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";

const PIXEL_EYE_CLIENT_KEY = "pixeleye";
const IST_TIMEZONE = "Asia/Kolkata";
const PDF_EMPTY_VALUE = "\u2014";

const CSV_HEADERS = [
  "S.No",
  "Name",
  "Mobile Number",
  "Service",
  "IP Address",
  "UTM Source",
  "Created At",
  "Updated At",
];

const PDF_COLUMNS = [
  { key: "serialNumber", label: "S.No", width: 40, align: "center" },
  { key: "name", label: "Name", width: 130 },
  { key: "mobile_number", label: "Mobile", width: 95 },
  { key: "service", label: "Service", width: 120 },
  { key: "ip_address", label: "IP Address", width: 98 },
  { key: "utm_source", label: "UTM Source", width: 110 },
  { key: "created_at", label: "Created At", width: 95 },
];

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getIstDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const valueByType = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(valueByType.year),
    month: Number(valueByType.month),
    day: Number(valueByType.day),
  };
};

const buildIstDate = (year, month, day, time) =>
  new Date(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}+05:30`,
  );

const getIstRangeBounds = () => {
  const now = new Date();
  const { year, month, day } = getIstDateParts(now);

  return {
    now,
    todayStart: buildIstDate(year, month, day, "00:00:00.000"),
    monthStart: buildIstDate(year, month, 1, "00:00:00.000"),
  };
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

const formatFileDateStamp = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const normalizePayload = (data) => {
  const payload = { ...data };

  for (const field of ["name", "mobile_number", "service", "ip_address", "utm_source"]) {
    if (typeof payload[field] === "string") {
      payload[field] = payload[field].trim();
    }
  }

  return payload;
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
    expectedModuleKey: PIXEL_EYE_CLIENT_KEY,
  });

  return {
    ...tenant.getScope(filters),
    client_id: clientId,
  };
};

const buildLeadFilters = (filters = {}) => {
  const { search, service, utm_source, start_date, end_date } = filters;
  const queryFilters = {};

  if (search) {
    queryFilters[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { mobile_number: { [Op.like]: `%${search}%` } },
      { service: { [Op.like]: `%${search}%` } },
      { utm_source: { [Op.like]: `%${search}%` } },
    ];
  }

  if (service) queryFilters.service = service;
  if (utm_source) queryFilters.utm_source = utm_source;

  if (start_date || end_date) {
    queryFilters.created_at = {};
    if (start_date) {
      queryFilters.created_at[Op.gte] = new Date(start_date);
    }
    if (end_date) {
      const inclusiveEnd = new Date(end_date);
      inclusiveEnd.setHours(23, 59, 59, 999);
      queryFilters.created_at[Op.lte] = inclusiveEnd;
    }
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
    return db.PixelEyeWebsiteLead.findAndCountAll({
      ...query,
      distinct: true,
    });
  }

  return db.PixelEyeWebsiteLead.findAll(query);
};

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
        row.ip_address,
        row.utm_source,
        row.created_at,
        row.updated_at,
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return Buffer.from(lines.join("\n"), "utf8");
};

const sanitizePdfText = (value) => {
  if (value === null || value === undefined) return PDF_EMPTY_VALUE;
  const text = String(value).replace(/\r?\n|\r/g, " ").trim();
  return text || PDF_EMPTY_VALUE;
};

const buildPdfBuffer = (rows) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 20,
      bufferPages: true,
    });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const drawHeader = (pageNumber) => {
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(
        "PixelEye Website Leads - Lead Report",
        doc.page.margins.left,
        20,
      );
      doc.font("Helvetica").fontSize(9.5).fillColor("#475569").text(
        `Generated at: ${formatTimestamp(new Date()) || PDF_EMPTY_VALUE}`,
        doc.page.margins.left,
        42,
      );
      doc.font("Helvetica").fontSize(9.5).fillColor("#475569").text(
        `Page ${pageNumber}`,
        doc.page.width - doc.page.margins.right - 60,
        42,
        { width: 60, align: "right" },
      );

      let x = doc.page.margins.left;
      const y = 68;

      doc.rect(
        doc.page.margins.left,
        y,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        22,
      ).fillAndStroke("#F8FAFC", "#CBD5E1");

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0F172A");
      PDF_COLUMNS.forEach((column) => {
        doc.text(column.label, x + 4, y + 7, {
          width: column.width - 8,
          align: column.align || "left",
        });
        x += column.width;
      });

      return y + 22;
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

      doc
        .rect(
          doc.page.margins.left,
          y,
          doc.page.width - doc.page.margins.left - doc.page.margins.right,
          height,
        )
        .strokeColor("#E2E8F0")
        .lineWidth(1)
        .stroke();

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

    let pageNumber = 1;
    let y = drawHeader(pageNumber);
    const maxY = doc.page.height - doc.page.margins.bottom - 20;

    if (rows.length === 0) {
      doc.font("Helvetica").fontSize(11).fillColor("#475569").text(
        "No records found for the selected filters.",
        doc.page.margins.left,
        y + 16,
      );
      doc.end();
      return;
    }

    rows.forEach((row, index) => {
      const rowHeight = getRowHeight(row);
      if (y + rowHeight > maxY) {
        doc.addPage();
        pageNumber += 1;
        y = drawHeader(pageNumber);
      }

      drawRow(row, y, rowHeight);
      y += rowHeight;

      if (index === rows.length - 1) {
        doc.font("Helvetica").fontSize(8).fillColor("#64748B").text(
          `Total records: ${rows.length}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 2,
        );
      }
    });

    doc.end();
  });

export const listPixelEyeWebsiteLeads = async (filters, tenant) => {
  const page = Number(filters?.page || 1);
  const limit = Number(filters?.limit || 20);
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

export const exportPixelEyeWebsiteLeadReport = async (filters, tenant) => {
  const rows = await listLeadRows(filters, tenant);
  const exportRows = rows.map((row, index) => ({
    serialNumber: index + 1,
    name: row.name || "",
    mobile_number: row.mobile_number || "",
    service: row.service || "",
    ip_address: row.ip_address || "",
    utm_source: row.utm_source || "",
    created_at: formatTimestamp(row.created_at),
    updated_at: formatTimestamp(row.updated_at),
  }));
  const fileDate = formatFileDateStamp();

  if (filters.format === "pdf") {
    return {
      buffer: await buildPdfBuffer(exportRows),
      contentType: "application/pdf",
      filename: `pixel-eye-website-leads-${fileDate}.pdf`,
    };
  }

  return {
    buffer: buildCsvBuffer(exportRows),
    contentType: "text/csv; charset=utf-8",
    filename: `pixel-eye-website-leads-${fileDate}.csv`,
  };
};

export const getPixelEyeWebsiteLeadSummary = async (filters, tenant) => {
  const where = await buildLeadWhere(filters, tenant);
  const { now, todayStart, monthStart } = getIstRangeBounds();

  const [totalLeads, todayLeads, thisMonthLeads, topServiceRow] = await Promise.all([
    db.PixelEyeWebsiteLead.count({ where }),
    db.PixelEyeWebsiteLead.count({
      where: {
        ...where,
        created_at: {
          [Op.gte]: todayStart,
          [Op.lte]: now,
        },
      },
    }),
    db.PixelEyeWebsiteLead.count({
      where: {
        ...where,
        created_at: {
          [Op.gte]: monthStart,
          [Op.lte]: now,
        },
      },
    }),
    db.PixelEyeWebsiteLead.findOne({
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

export const getPixelEyeWebsiteLeadById = async (id, tenant, requestedClientKey) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const record = await db.PixelEyeWebsiteLead.findOne({ where });

  if (!record) {
    throw createHttpError(404, "PixelEye Website Lead not found");
  }

  return record;
};

export const createPixelEyeWebsiteLead = async (data, tenant, requestedClientKey) => {
  const tenantWhere = await resolveTenantWhere(tenant, requestedClientKey);

  return db.PixelEyeWebsiteLead.create({
    ...normalizePayload(data),
    client_id: tenantWhere.client_id,
  });
};

export const createPixelEyeWebsiteLeadPublicRecord = async (data, clientId) =>
  db.PixelEyeWebsiteLead.create({
    ...normalizePayload(data),
    client_id: clientId,
  });

export const updatePixelEyeWebsiteLead = async (id, data, tenant, requestedClientKey) => {
  const record = await getPixelEyeWebsiteLeadById(id, tenant, requestedClientKey);
  return record.update(normalizePayload(data));
};

export const deletePixelEyeWebsiteLead = async (id, tenant, requestedClientKey) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const deleted = await db.PixelEyeWebsiteLead.destroy({ where });

  if (!deleted) {
    throw createHttpError(404, "PixelEye Website Lead not found");
  }
};
