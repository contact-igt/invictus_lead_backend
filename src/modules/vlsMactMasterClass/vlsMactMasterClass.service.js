import PDFDocument from "pdfkit";
import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";
import { getInclusiveDateRange, getTodayBounds } from "../../utils/dateTime.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";

const VLS_CLIENT_KEY = "vls_law";
const IST_TIMEZONE = "Asia/Kolkata";
const PDF_EMPTY_VALUE = "-";

const CSV_HEADERS = [
  "S.No",
  "Name",
  "Mobile",
  "Email",
  "Amount",
  "Registered Date",
  "Programme Date",
  "Payment Status",
  "Captured",
  "Page Name",
  "IP Address",
  "UTM Source",
  "Created At",
  "Updated At",
];

const PDF_COLUMNS = [
  { key: "serialNumber", label: "S.No", width: 38, align: "center" },
  { key: "name", label: "Name", width: 92 },
  { key: "mobile", label: "Mobile", width: 76 },
  { key: "email", label: "Email", width: 112 },
  { key: "amount", label: "Amount", width: 62, align: "right" },
  { key: "registered_date", label: "Registered", width: 78 },
  { key: "programm_date", label: "Programme", width: 78 },
  { key: "payment_status", label: "Payment", width: 72 },
  { key: "captured", label: "Captured", width: 58 },
  { key: "page_name", label: "Page", width: 98 },
  { key: "utm_source", label: "UTM", width: 72 },
  { key: "created_at", label: "Created", width: 84 },
];

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeOptionalText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const normalizePayload = (data) => ({
  name: String(data.name || "").trim(),
  mobile: String(data.mobile || "").trim(),
  email: normalizeOptionalText(data.email),
  amount: data.amount === "" || data.amount === null || data.amount === undefined ? null : data.amount,
  registered_date: data.registered_date || null,
  programm_date: data.programm_date || null,
  payment_status: normalizeOptionalText(data.payment_status),
  captured: data.captured === "" || data.captured === null || data.captured === undefined ? null : data.captured,
  page_name: normalizeOptionalText(data.page_name),
  ip_address: normalizeOptionalText(data.ip_address),
  utm_source: normalizeOptionalText(data.utm_source),
});

const getIstRangeBounds = () => {
  const { now, start: todayStart } = getTodayBounds();
  return { now, todayStart };
};

const formatDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
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

const formatAmount = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return String(value);
  return numberValue.toFixed(2);
};

const formatCaptured = (value) => {
  if (value === null || value === undefined || value === "") return "";
  return value ? "Yes" : "No";
};

const buildInclusiveDateRange = (start, end) => {
  const { start: rangeStart, end: rangeEnd } = getInclusiveDateRange(start, end);
  const range = {
    ...(rangeStart ? { [Op.gte]: rangeStart } : {}),
    ...(rangeEnd ? { [Op.lte]: rangeEnd } : {}),
  };
  return Object.keys(range).length ? range : null;
};

const resolveTenantWhere = async (tenant, requestedClientKey, filters = {}) => {
  if (!tenant?.isSuperAdmin) {
    if (!tenant?.id) throw createHttpError(403, "A valid tenant context is required");
    return tenant.getScope(filters);
  }

  const clientId = await resolveClientId({
    tenant,
    requestedClientKey,
    expectedModuleKey: VLS_CLIENT_KEY,
  });

  return {
    ...tenant.getScope(filters),
    client_id: clientId,
  };
};

const buildFilters = (filters = {}) => {
  const queryFilters = {};
  const {
    search,
    payment_status,
    captured,
    page_name,
    utm_source,
    registered_start_date,
    registered_end_date,
    programm_start_date,
    programm_end_date,
  } = filters;

  if (search) {
    queryFilters[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { mobile: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { payment_status: { [Op.like]: `%${search}%` } },
      { page_name: { [Op.like]: `%${search}%` } },
      { utm_source: { [Op.like]: `%${search}%` } },
    ];
  }

  if (payment_status) queryFilters.payment_status = payment_status;
  if (captured !== undefined && captured !== "") queryFilters.captured = captured;
  if (page_name) queryFilters.page_name = { [Op.like]: `%${page_name}%` };
  if (utm_source) queryFilters.utm_source = { [Op.like]: `%${utm_source}%` };

  const registeredRange = buildInclusiveDateRange(registered_start_date, registered_end_date);
  if (registeredRange) queryFilters.registered_date = registeredRange;

  const programmRange = buildInclusiveDateRange(programm_start_date, programm_end_date);
  if (programmRange) queryFilters.programm_date = programmRange;

  return queryFilters;
};

const buildWhere = async (filters, tenant) => {
  const requestedClientKey = filters?._client_key;
  return resolveTenantWhere(tenant, requestedClientKey, buildFilters(filters));
};

const attributes = [
  "id",
  "name",
  "mobile",
  "email",
  "amount",
  "registered_date",
  "programm_date",
  "payment_status",
  "captured",
  "page_name",
  "ip_address",
  "utm_source",
  "created_at",
  "updated_at",
];

const listRows = async (filters, tenant, options = {}) => {
  const where = await buildWhere(filters, tenant);
  const query = {
    where,
    attributes,
    order: [["created_at", "DESC"], ["id", "DESC"]],
  };

  if (options.paginate) {
    return db.VlsMactMasterClass.findAndCountAll({
      ...query,
      limit: options.limit,
      offset: options.offset,
      distinct: true,
    });
  }

  return db.VlsMactMasterClass.findAll(query);
};

const escapeCsvValue = (value) => {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

const buildCsvBuffer = (rows) => {
  const lines = [CSV_HEADERS.map(escapeCsvValue).join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        row.serialNumber,
        row.name,
        row.mobile,
        row.email,
        row.amount,
        row.registered_date,
        row.programm_date,
        row.payment_status,
        row.captured,
        row.page_name,
        row.ip_address,
        row.utm_source,
        row.created_at,
        row.updated_at,
      ].map(escapeCsvValue).join(","),
    );
  });
  return Buffer.from(lines.join("\n"), "utf8");
};

const buildPdfBuffer = (rows) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 20, bufferPages: true });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const drawHeader = (pageNumber) => {
      doc.font("Helvetica-Bold").fontSize(17).fillColor("#111827").text(
        "VLS Law - MACT Master Class Registration Report",
        doc.page.margins.left,
        20,
      );
      doc.font("Helvetica").fontSize(9).fillColor("#475569").text(
        `Generated at: ${formatTimestamp(new Date()) || PDF_EMPTY_VALUE}`,
        doc.page.margins.left,
        42,
      );
      doc.font("Helvetica").fontSize(9).fillColor("#475569").text(
        `Page ${pageNumber}`,
        doc.page.width - doc.page.margins.right - 60,
        42,
        { width: 60, align: "right" },
      );

      let x = doc.page.margins.left;
      const y = 68;
      doc.rect(doc.page.margins.left, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 22)
        .fillAndStroke("#F8FAFC", "#CBD5E1");
      doc.font("Helvetica-Bold").fontSize(8.2).fillColor("#0F172A");
      PDF_COLUMNS.forEach((column) => {
        doc.text(column.label, x + 3, y + 7, { width: column.width - 6, align: column.align || "left" });
        x += column.width;
      });
      return y + 22;
    };

    const getRowHeight = (row) => {
      doc.font("Helvetica").fontSize(7.6);
      const heights = PDF_COLUMNS.map((column) =>
        doc.heightOfString(String(row[column.key] || PDF_EMPTY_VALUE), {
          width: column.width - 8,
          align: column.align || "left",
        }),
      );
      return Math.max(22, Math.ceil(Math.max(...heights)) + 10);
    };

    const drawRow = (row, y, height) => {
      let x = doc.page.margins.left;
      doc.rect(doc.page.margins.left, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, height)
        .strokeColor("#E2E8F0")
        .lineWidth(1)
        .stroke();
      doc.font("Helvetica").fontSize(7.6).fillColor("#111827");
      PDF_COLUMNS.forEach((column) => {
        doc.text(String(row[column.key] || PDF_EMPTY_VALUE), x + 3, y + 6, {
          width: column.width - 6,
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
      const height = getRowHeight(row);
      if (y + height > maxY) {
        doc.addPage();
        pageNumber += 1;
        y = drawHeader(pageNumber);
      }
      drawRow(row, y, height);
      y += height;
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

const mapExportRow = (row, index) => ({
  serialNumber: index + 1,
  name: row.name || "",
  mobile: row.mobile || "",
  email: row.email || "",
  amount: formatAmount(row.amount),
  registered_date: formatDate(row.registered_date),
  programm_date: formatDate(row.programm_date),
  payment_status: row.payment_status || "",
  captured: formatCaptured(row.captured),
  page_name: row.page_name || "",
  ip_address: row.ip_address || "",
  utm_source: row.utm_source || "",
  created_at: formatTimestamp(row.created_at),
  updated_at: formatTimestamp(row.updated_at),
});

export const listVlsMactMasterClassRegistrations = async (filters, tenant) => {
  const page = Number(filters?.page || 1);
  const limit = Number(filters?.limit || 20);
  const offset = (page - 1) * limit;
  const { rows, count } = await listRows(filters, tenant, { paginate: true, limit, offset });

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

export const exportVlsMactMasterClassReport = async (filters, tenant) => {
  const rows = await listRows(filters, tenant);
  const exportRows = rows.map(mapExportRow);
  const fileDate = formatFileDateStamp();

  if (filters.format === "pdf") {
    return {
      buffer: await buildPdfBuffer(exportRows),
      contentType: "application/pdf",
      filename: `vls-mact-master-class-registrations-${fileDate}.pdf`,
    };
  }

  return {
    buffer: buildCsvBuffer(exportRows),
    contentType: "text/csv; charset=utf-8",
    filename: `vls-mact-master-class-registrations-${fileDate}.csv`,
  };
};

export const getVlsMactMasterClassSummary = async (filters, tenant) => {
  const where = await buildWhere(filters, tenant);
  const { now, todayStart } = getIstRangeBounds();

  const [totalRegistrations, todayRegistrations, totalAmount, paidRegistrations] = await Promise.all([
    db.VlsMactMasterClass.count({ where }),
    db.VlsMactMasterClass.count({
      where: {
        ...where,
        registered_date: {
          [Op.gte]: todayStart,
          [Op.lte]: now,
        },
      },
    }),
    db.VlsMactMasterClass.findOne({
      attributes: [[fn("COALESCE", fn("SUM", col("amount")), 0), "total_amount"]],
      where,
      raw: true,
    }),
    db.VlsMactMasterClass.count({
      where: {
        ...where,
        payment_status: "paid",
      },
    }),
  ]);

  return {
    total_registrations: totalRegistrations,
    today_registrations: todayRegistrations,
    total_amount: Number(totalAmount?.total_amount || 0),
    paid_registrations: paidRegistrations,
  };
};

export const getVlsMactMasterClassRegistrationById = async (id, tenant, requestedClientKey) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const record = await db.VlsMactMasterClass.findOne({ where, attributes });
  if (!record) throw createHttpError(404, "MACT Master Class registration not found");
  return record;
};

export const createVlsMactMasterClassRegistration = async (data, tenant, requestedClientKey) => {
  const tenantWhere = await resolveTenantWhere(tenant, requestedClientKey);
  return db.VlsMactMasterClass.create({
    ...normalizePayload(data),
    client_id: tenantWhere.client_id,
  });
};

export const createVlsMactMasterClassPublicRegistration = async (data, clientId) =>
  db.VlsMactMasterClass.create({
    ...normalizePayload(data),
    client_id: clientId,
  });

export const updateVlsMactMasterClassRegistration = async (id, data, tenant, requestedClientKey) => {
  const record = await getVlsMactMasterClassRegistrationById(id, tenant, requestedClientKey);
  return record.update(normalizePayload({ ...record.toJSON(), ...data }));
};

export const deleteVlsMactMasterClassRegistration = async (id, tenant, requestedClientKey) => {
  const where = await resolveTenantWhere(tenant, requestedClientKey, { id });
  const deleted = await db.VlsMactMasterClass.destroy({ where });
  if (!deleted) throw createHttpError(404, "MACT Master Class registration not found");
};
