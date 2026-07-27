import PDFDocument from "pdfkit";
import { Op, fn, col } from "sequelize";
import db from "../../database/index.js";
import { getInclusiveDateRange, getTodayBounds } from "../../utils/dateTime.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";
import { escapeCsvValue } from "../../utils/csv.js";

const VLS_CLIENT_KEY = "vls_law";
const IST_TIMEZONE = "Asia/Kolkata";
const PDF_EMPTY_VALUE = "-";

const CSV_HEADERS = [
  "S.No",
  "Name",
  "Mobile",
  "Email",
  "City",
  "Profession",
  "Amount",
  "Registered Date",
  "Programme Date",
  "Payment Status",
  "Captured",
  "Page Name",
  "IP Address",
  "UTM Source",
  "UTM Medium",
  "UTM Campaign",
  "Created At",
  "Updated At",
];

const PDF_COLUMNS = [
  { key: "serialNumber", label: "S.No", width: 32, align: "center" },
  { key: "name", label: "Name", width: 85 },
  { key: "mobile", label: "Mobile", width: 70 },
  { key: "email", label: "Email", width: 95 },
  { key: "city", label: "City", width: 60 },
  { key: "profession", label: "Profession", width: 70 },
  { key: "amount", label: "Amount", width: 55, align: "right" },
  { key: "registered_date", label: "Registered", width: 68 },
  { key: "programm_date", label: "Programme", width: 68 },
  { key: "payment_status", label: "Payment", width: 60 },
  { key: "captured", label: "Captured", width: 50 },
  { key: "page_name", label: "Page", width: 80 },
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

const parseBooleanValue = (value) => {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
};

const normalizePayload = (data) => ({
  name: String(data.name || "").trim(),
  mobile: String(data.mobile || "").trim(),
  email: normalizeOptionalText(data.email),
  city: normalizeOptionalText(data.city),
  profession: normalizeOptionalText(data.profession),
  amount: data.amount === "" || data.amount === null || data.amount === undefined ? null : data.amount,
  registered_date: data.registered_date || null,
  programm_date: data.programm_date || null,
  razorpay_order_id: normalizeOptionalText(data.razorpay_order_id),
  razorpay_payment_id: normalizeOptionalText(data.razorpay_payment_id),
  razorpay_signature: normalizeOptionalText(data.razorpay_signature),
  payment_status: normalizeOptionalText(data.payment_status),
  captured: parseBooleanValue(data.captured),
  page_name: normalizeOptionalText(data.page_name),
  ip_address: normalizeOptionalText(data.ip_address),
  utm_source: normalizeOptionalText(data.utm_source),
  utm_medium: normalizeOptionalText(data.utm_medium),
  utm_campaign: normalizeOptionalText(data.utm_campaign),
  utm_term: normalizeOptionalText(data.utm_term),
  utm_content: normalizeOptionalText(data.utm_content),
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

const formatAmount = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isNaN(parsed) ? "" : parsed.toFixed(2);
};

const formatCaptured = (value) => {
  if (value === true || value === "true") return "Yes";
  if (value === false || value === "false") return "No";
  return "";
};

const formatPdfText = (value) => {
  if (value === null || value === undefined || value === "") return PDF_EMPTY_VALUE;
  return String(value);
};

const sanitizePdfCellText = (text) =>
  String(text)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const truncatePdfText = (doc, text, maxWidth) => {
  const sanitized = sanitizePdfCellText(text);
  if (!sanitized) return PDF_EMPTY_VALUE;
  if (doc.widthOfString(sanitized) <= maxWidth) return sanitized;

  const ellipsis = "...";
  let current = sanitized;
  while (current.length > 0 && doc.widthOfString(`${current}${ellipsis}`) > maxWidth) {
    current = current.slice(0, -1);
  }

  return current ? `${current}${ellipsis}` : ellipsis;
};

const buildInclusiveDateRange = (start, end) => {
  const { start: rangeStart, end: rangeEnd } = getInclusiveDateRange(start, end);
  const range = {
    ...(rangeStart ? { [Op.gte]: rangeStart } : {}),
    ...(rangeEnd ? { [Op.lte]: rangeEnd } : {}),
  };
  return Object.keys(range).length ? range : null;
};

const buildWhereClause = (clientId, queryParams = {}) => {
  const where = { client_id: clientId };
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
  } = queryParams;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { mobile: { [Op.like]: term } },
      { email: { [Op.like]: term } },
      { city: { [Op.like]: term } },
      { profession: { [Op.like]: term } },
      { page_name: { [Op.like]: term } },
      { utm_source: { [Op.like]: term } },
    ];
  }

  if (payment_status && payment_status.trim()) {
    where.payment_status = payment_status.trim();
  }

  if (captured !== undefined && captured !== null && captured !== "") {
    const parsed = parseBooleanValue(captured);
    if (parsed !== null) where.captured = parsed;
  }

  if (page_name && page_name.trim()) {
    where.page_name = page_name.trim();
  }

  if (utm_source && utm_source.trim()) {
    where.utm_source = utm_source.trim();
  }

  const registeredRange = buildInclusiveDateRange(registered_start_date, registered_end_date);
  if (registeredRange) {
    where.registered_date = registeredRange;
  }

  const programmRange = buildInclusiveDateRange(programm_start_date, programm_end_date);
  if (programmRange) {
    where.programm_date = programmRange;
  }

  return where;
};

const generateCsvReport = (records) => {
  const rows = [CSV_HEADERS.map(escapeCsvValue).join(",")];

  records.forEach((record, index) => {
    const row = [
      index + 1,
      record.name || "",
      record.mobile || "",
      record.email || "",
      record.city || "",
      record.profession || "",
      formatAmount(record.amount),
      formatDate(record.registered_date),
      formatDate(record.programm_date),
      record.payment_status || "",
      formatCaptured(record.captured),
      record.page_name || "",
      record.ip_address || "",
      record.utm_source || "",
      record.utm_medium || "",
      record.utm_campaign || "",
      formatTimestamp(record.createdAt),
      formatTimestamp(record.updatedAt),
    ];
    rows.push(row.map(escapeCsvValue).join(","));
  });

  return Buffer.from(rows.join("\n"), "utf-8");
};

const generatePdfReport = (records) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 20,
    });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", (error) => reject(error));

    const margin = 20;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - margin * 2;
    const rowHeight = 22;
    const headerHeight = 26;
    const startY = 70;
    const maxY = pageHeight - 35;

    let currentY = startY;

    const renderHeader = () => {
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text("Consumer Protection Law Masterclass Registrations", margin, 22);

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#6B7280")
        .text(`Generated on ${formatTimestamp(new Date())}`, margin, 42);

      doc
        .rect(margin, startY, contentWidth, headerHeight)
        .fillAndStroke("#F3F4F6", "#E5E7EB");

      let currentX = margin;
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#111827");

      PDF_COLUMNS.forEach((colDef) => {
        doc.text(colDef.label, currentX + 4, startY + 8, {
          width: colDef.width - 8,
          align: colDef.align || "left",
        });
        currentX += colDef.width;
      });

      currentY = startY + headerHeight;
    };

    renderHeader();

    records.forEach((record, index) => {
      if (currentY + rowHeight > maxY) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 20 });
        currentY = startY;
        renderHeader();
      }

      const fillColor = index % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
      doc
        .rect(margin, currentY, contentWidth, rowHeight)
        .fillAndStroke(fillColor, "#E5E7EB");

      const rowValues = {
        serialNumber: String(index + 1),
        name: formatPdfText(record.name),
        mobile: formatPdfText(record.mobile),
        email: formatPdfText(record.email),
        city: formatPdfText(record.city),
        profession: formatPdfText(record.profession),
        amount: formatPdfText(formatAmount(record.amount)),
        registered_date: formatPdfText(formatDate(record.registered_date)),
        programm_date: formatPdfText(formatDate(record.programm_date)),
        payment_status: formatPdfText(record.payment_status),
        captured: formatPdfText(formatCaptured(record.captured)),
        page_name: formatPdfText(record.page_name),
      };

      let currentX = margin;
      doc.fontSize(7.5).font("Helvetica").fillColor("#1F2937");

      PDF_COLUMNS.forEach((colDef) => {
        const text = truncatePdfText(doc, rowValues[colDef.key], colDef.width - 8);
        doc.text(text, currentX + 4, currentY + 6, {
          width: colDef.width - 8,
          align: colDef.align || "left",
        });
        currentX += colDef.width;
      });

      currentY += rowHeight;
    });

    doc.end();
  });

export const createVlsConsumerProtectionLawMasterClassPublicRegistration = async (
  data,
  publicTenantId
) => {
  if (!publicTenantId) {
    throw createHttpError(400, "Client mapping unresolved for public registration");
  }

  const payload = normalizePayload(data);
  const record = await db.VlsConsumerProtectionLawMasterClass.create({
    ...payload,
    client_id: publicTenantId,
    registered_date: payload.registered_date || new Date(),
  });

  return record;
};

export const listVlsConsumerProtectionLawMasterClassRegistrations = async (
  queryParams,
  tenantContext
) => {
  const clientId = await resolveClientId({
    tenant: tenantContext,
    requestedClientKey: queryParams?._client_key,
    expectedModuleKey: VLS_CLIENT_KEY,
  });
  const where = buildWhereClause(clientId, queryParams);

  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.max(1, parseInt(queryParams.limit, 10) || 20);
  const offset = (page - 1) * limit;

  const { count: total, rows: data } =
    await db.VlsConsumerProtectionLawMasterClass.findAndCountAll({
      where,
      limit,
      offset,
      order: [["created_at", "DESC"]],
    });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getVlsConsumerProtectionLawMasterClassSummary = async (
  queryParams,
  tenantContext
) => {
  const clientId = await resolveClientId({
    tenant: tenantContext,
    requestedClientKey: queryParams?._client_key,
    expectedModuleKey: VLS_CLIENT_KEY,
  });
  const where = buildWhereClause(clientId, queryParams);
  const { todayStart } = getIstRangeBounds();

  const totalRegistrations = await db.VlsConsumerProtectionLawMasterClass.count({ where });

  const todayWhere = {
    ...where,
    registered_date: { [Op.gte]: todayStart },
  };
  const todayRegistrations = await db.VlsConsumerProtectionLawMasterClass.count({
    where: todayWhere,
  });

  const totalAmountResult = await db.VlsConsumerProtectionLawMasterClass.findAll({
    where,
    attributes: [[fn("SUM", col("amount")), "total_amount"]],
    raw: true,
  });
  const totalAmount = parseFloat(totalAmountResult[0]?.total_amount || 0);

  const paidWhere = {
    ...where,
    payment_status: "paid",
  };
  const paidRegistrations = await db.VlsConsumerProtectionLawMasterClass.count({
    where: paidWhere,
  });

  return {
    total_registrations: totalRegistrations,
    today_registrations: todayRegistrations,
    total_amount: totalAmount,
    paid_registrations: paidRegistrations,
  };
};

export const exportVlsConsumerProtectionLawMasterClassReport = async (
  queryParams,
  tenantContext
) => {
  const clientId = await resolveClientId({
    tenant: tenantContext,
    requestedClientKey: queryParams?._client_key,
    expectedModuleKey: VLS_CLIENT_KEY,
  });
  const where = buildWhereClause(clientId, queryParams);
  const format = String(queryParams.format || "csv").toLowerCase();

  const records = await db.VlsConsumerProtectionLawMasterClass.findAll({
    where,
    order: [["created_at", "DESC"]],
  });

  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "pdf") {
    const buffer = await generatePdfReport(records);
    return {
      buffer,
      contentType: "application/pdf",
      filename: `consumer-protection-law-registrations-${timestamp}.pdf`,
    };
  }

  const buffer = generateCsvReport(records);
  return {
    buffer,
    contentType: "text/csv; charset=utf-8",
    filename: `consumer-protection-law-registrations-${timestamp}.csv`,
  };
};

export const getVlsConsumerProtectionLawMasterClassRegistrationById = async (
  id,
  tenantContext,
  superAdminClientKey
) => {
  const clientId = await resolveClientId({
    tenant: tenantContext,
    requestedClientKey: superAdminClientKey,
    expectedModuleKey: VLS_CLIENT_KEY,
  });
  const record = await db.VlsConsumerProtectionLawMasterClass.findOne({
    where: { id, client_id: clientId },
  });

  if (!record) {
    throw createHttpError(404, "Consumer Protection Law registration record not found");
  }

  return record;
};

export const createVlsConsumerProtectionLawMasterClassRegistration = async (
  data,
  tenantContext,
  superAdminClientKey
) => {
  const clientId = await resolveClientId({
    tenant: tenantContext,
    requestedClientKey: superAdminClientKey,
    expectedModuleKey: VLS_CLIENT_KEY,
  });
  const payload = normalizePayload(data);

  const record = await db.VlsConsumerProtectionLawMasterClass.create({
    ...payload,
    client_id: clientId,
    registered_date: payload.registered_date || new Date(),
  });

  return record;
};

export const updateVlsConsumerProtectionLawMasterClassRegistration = async (
  id,
  data,
  tenantContext,
  superAdminClientKey
) => {
  const clientId = await resolveClientId({
    tenant: tenantContext,
    requestedClientKey: superAdminClientKey,
    expectedModuleKey: VLS_CLIENT_KEY,
  });
  const record = await db.VlsConsumerProtectionLawMasterClass.findOne({
    where: { id, client_id: clientId },
  });

  if (!record) {
    throw createHttpError(404, "Consumer Protection Law registration record not found");
  }

  const payload = normalizePayload({ ...record.toJSON(), ...data });
  await record.update(payload);

  return record;
};

export const deleteVlsConsumerProtectionLawMasterClassRegistration = async (
  id,
  tenantContext,
  superAdminClientKey
) => {
  const clientId = await resolveClientId({
    tenant: tenantContext,
    requestedClientKey: superAdminClientKey,
    expectedModuleKey: VLS_CLIENT_KEY,
  });
  const record = await db.VlsConsumerProtectionLawMasterClass.findOne({
    where: { id, client_id: clientId },
  });

  if (!record) {
    throw createHttpError(404, "Consumer Protection Law registration record not found");
  }

  await record.destroy();
  return true;
};
