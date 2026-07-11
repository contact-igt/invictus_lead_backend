import {
  listPixelEyeLeads,
  listPixelEyeLeadsForExport,
  getPixelEyeLead,
  createPixelEyeLead,
  findPixelEyeLeadByPhone,
  updatePixelEyeLead,
  updatePixelEyeFollowUpOutcome,
  continuePixelEyeLeadFromManualCreate,
  deletePixelEyeLead,
  reschedulePixelEyeFollowUp,
  cancelPixelEyeFollowUp,
} from "./pixelEye.service.js";
import { getFollowUpHistoryForLead } from "./pixelEyeFollowUpHistory.service.js";
import {
  listNotificationStates,
  getNotificationSummary,
  isTerminalLeadStatus,
  deleteNotificationStates,
} from "./pixelEyeNotification.service.js";
import { createFollowUpHistoryEntry } from "./pixelEyeFollowUpHistory.service.js";
import {
  listFollowUpCallCompliance,
  listMissedFollowUpCalls,
  getFollowUpCallComplianceSummary as getFollowUpCallComplianceSummaryService,
} from "./pixelEyeFollowUpCallCompliance.service.js";
import { getFollowUpLifecycleSummary as getFollowUpLifecycleSummaryService } from "./pixelEyeFollowUpLifecycleSummary.service.js";
import db from "../../database/index.js";
import { Op } from "sequelize";
import PDFDocument from "pdfkit";
import {
  resolveClientId as resolveContextClientId,
  resolveScopedTenant,
} from "../../utils/resolveClientContext.js";

const PIXEL_EYE_CLIENT_KEY = "pixeleye";

const EXPORT_COLUMNS = [
  { key: "serial", label: "#" },
  { key: "date", label: "Lead Date" },
  { key: "time", label: "Lead Time" },
  { key: "customer_name", label: "Customer" },
  { key: "phone_number", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "call_id", label: "Call ID" },
  { key: "agent_name", label: "Agent" },
  { key: "source", label: "Source" },
  { key: "type_of_enquiry", label: "Enquiry" },
  { key: "follow_up_date", label: "Follow-up Date" },
  { key: "day_1", label: "Day 1" },
  { key: "day_2", label: "Day 2" },
  { key: "day_3", label: "Day 3" },
  { key: "day_4", label: "Day 4" },
  { key: "day_5", label: "Day 5" },
  { key: "notes", label: "Customer Notes" },
  { key: "createdAt", label: "Created At" },
  { key: "updatedAt", label: "Updated At" },
];

const formatDateValue = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  const isoDateMatch = text.match(/^\d{4}-\d{2}-\d{2}/);
  return isoDateMatch ? isoDateMatch[0] : text;
};

const formatDateTimeValue = (value) => {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).trim();
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const normalizeExportFilters = (query = {}) => ({
  dateFrom: String(query.dateFrom || "").trim(),
  dateTo: String(query.dateTo || "").trim(),
  agent: String(query.agent || "").trim(),
  status: String(query.status || "").trim(),
  search: String(query.search || "").trim(),
});

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value)
    .replace(/\r?\n|\r/g, " ")
    .trim();
  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const serializeLeadField = (lead, key, index = 0) => {
  if (key === "serial") {
    return index + 1;
  }
  if (key === "follow_up_date" || key === "date") {
    return formatDateValue(lead?.[key]);
  }
  if (key === "createdAt") {
    return formatDateTimeValue(lead?.createdAt || lead?.created_at || "");
  }
  if (key === "updatedAt") {
    return formatDateTimeValue(lead?.updatedAt || lead?.updated_at || "");
  }
  return lead?.[key] ?? "";
};

const createCsvPayload = (leads) => {
  const headers = EXPORT_COLUMNS.map((column) => column.label).join(",");
  const rows = leads.map((lead, index) =>
    EXPORT_COLUMNS.map((column) =>
      escapeCsvValue(serializeLeadField(lead, column.key, index)),
    ).join(","),
  );

  return [headers, ...rows].join("\n");
};

const createFilterSummary = ({ dateFrom, dateTo, agent, status, search }) => {
  const activeFilters = [];
  if (dateFrom) activeFilters.push(`From: ${dateFrom}`);
  if (dateTo) activeFilters.push(`To: ${dateTo}`);
  if (agent) activeFilters.push(`Agent: ${agent}`);
  if (status) activeFilters.push(`Status: ${status}`);
  if (search) activeFilters.push(`Search: ${search}`);
  return activeFilters.length > 0 ? activeFilters.join(" | ") : "None";
};

const DAY_OUTCOME_KEYS = ["day_1", "day_2", "day_3", "day_4", "day_5"];

const PDF_LAYOUT = {
  margin: 20,
  footerHeight: 16,
  headerBottomGap: 8,
  rowPaddingX: 4,
  rowPaddingY: 3,
  tableHeaderHeight: 22,
};

const PDF_COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#D7DEE7",
  headerLine: "#CBD5E1",
  headerFill: "#F3F6FA",
  white: "#FFFFFF",
};

const sanitizePdfText = (value) => {
  if (value === null || value === undefined) return "-";
  const text = String(value)
    .replace(/\r?\n|\r/g, " ")
    .trim();
  return text || "-";
};

const formatReadableDate = (value) => {
  if (!value) return "-";

  const normalized = formatDateValue(value);
  const parsed = normalized
    ? new Date(`${normalized}T00:00:00`)
    : new Date(String(value).trim());

  if (Number.isNaN(parsed.getTime())) {
    return sanitizePdfText(normalized || value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const formatReadableDateTime = (value) => {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return sanitizePdfText(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
};

const hasLeadOutcome = (lead) =>
  DAY_OUTCOME_KEYS.some((key) => !isBlank(lead?.[key]));

const buildPdfSummary = (leads) => {
  const totalLeads = leads.length;
  const leadsWithFollowUp = leads.filter(
    (lead) => !isBlank(formatDateValue(lead?.follow_up_date)),
  ).length;
  const leadsWithOutcome = leads.filter((lead) => hasLeadOutcome(lead)).length;
  const leadsPendingOutcome = leads.filter(
    (lead) =>
      !isBlank(formatDateValue(lead?.follow_up_date)) && !hasLeadOutcome(lead),
  ).length;

  return {
    totalLeads,
    leadsWithFollowUp,
    leadsWithOutcome,
    leadsPendingOutcome,
  };
};

const buildPdfHeaderLines = (filters, generatedAt, totalRecords) => {
  const filtersSummary = [];

  if (filters.dateFrom || filters.dateTo) {
    filtersSummary.push(
      `${formatReadableDate(filters.dateFrom) || "-"} to ${formatReadableDate(filters.dateTo) || "-"}`,
    );
  } else {
    filtersSummary.push("All dates");
  }

  if (filters.status) {
    filtersSummary.push(`Status: ${sanitizePdfText(filters.status)}`);
  }
  if (filters.search) {
    filtersSummary.push(`Search: ${sanitizePdfText(filters.search)}`);
  }
  if (filters.agent) {
    filtersSummary.push(`Agent: ${sanitizePdfText(filters.agent)}`);
  }

  return {
    generated: `Generated: ${formatReadableDateTime(generatedAt)}`,
    filters: `Filters: ${filtersSummary.join(" | ")}`,
    total: `Total Records: ${totalRecords}`,
  };
};

const PDF_TABLE_COLUMNS = [
  { key: "serial", label: "#", width: 22, align: "center" },
  { key: "date", label: "Date", width: 54 },
  { key: "customer_name", label: "Customer", width: 90 },
  { key: "phone_number", label: "Phone", width: 72 },
  { key: "status", label: "Status", width: 52 },
  { key: "call_id", label: "Call ID", width: 44 },
  { key: "type_of_enquiry", label: "Enquiry", width: 72 },
  { key: "follow_up_date", label: "Follow-up", width: 56 },
  { key: "day_1", label: "Day 1", width: 51 },
  { key: "day_2", label: "Day 2", width: 51 },
  { key: "day_3", label: "Day 3", width: 51 },
  { key: "day_4", label: "Day 4", width: 51 },
  { key: "day_5", label: "Day 5", width: 51 },
];

const getPdfTableCellValue = (lead, columnKey, serialNumber) => {
  if (columnKey === "serial") return String(serialNumber);
  if (columnKey === "date") return formatReadableDate(lead?.date);
  if (columnKey === "follow_up_date") {
    return formatReadableDate(lead?.follow_up_date);
  }
  return sanitizePdfText(lead?.[columnKey]);
};

const measurePdfTableRowHeight = (doc, lead, serialNumber) => {
  doc.font("Helvetica").fontSize(7.2);

  const maxCellHeight = PDF_TABLE_COLUMNS.reduce((maxHeight, column) => {
    const text = getPdfTableCellValue(lead, column.key, serialNumber);
    const textHeight = doc.heightOfString(text, {
      width: column.width - PDF_LAYOUT.rowPaddingX * 2,
      align: column.align || "left",
    });
    return Math.max(maxHeight, textHeight);
  }, 0);

  return Math.max(18, maxCellHeight + PDF_LAYOUT.rowPaddingY * 2);
};

const drawPdfTableHeader = (doc, startX, startY) => {
  let currentX = startX;

  PDF_TABLE_COLUMNS.forEach((column) => {
    doc
      .rect(currentX, startY, column.width, PDF_LAYOUT.tableHeaderHeight)
      .fillAndStroke(PDF_COLORS.headerFill, PDF_COLORS.border);

    doc
      .font("Helvetica-Bold")
      .fontSize(7.4)
      .fillColor(PDF_COLORS.text)
      .text(column.label, currentX + PDF_LAYOUT.rowPaddingX, startY + 6, {
        width: column.width - PDF_LAYOUT.rowPaddingX * 2,
        align: column.align || "left",
      });

    currentX += column.width;
  });

  return startY + PDF_LAYOUT.tableHeaderHeight;
};

const drawPdfTableRow = (
  doc,
  lead,
  serialNumber,
  startX,
  startY,
  rowHeight,
) => {
  let currentX = startX;

  PDF_TABLE_COLUMNS.forEach((column) => {
    const text = getPdfTableCellValue(lead, column.key, serialNumber);

    doc
      .rect(currentX, startY, column.width, rowHeight)
      .fillAndStroke(PDF_COLORS.white, PDF_COLORS.border);

    doc
      .font("Helvetica")
      .fontSize(7.2)
      .fillColor(PDF_COLORS.text)
      .text(
        text,
        currentX + PDF_LAYOUT.rowPaddingX,
        startY + PDF_LAYOUT.rowPaddingY,
        {
          width: column.width - PDF_LAYOUT.rowPaddingX * 2,
          height: rowHeight - PDF_LAYOUT.rowPaddingY * 2,
          align: column.align || "left",
        },
      );

    currentX += column.width;
  });
};

const drawPdfHeader = (doc, filters, generatedAt, summary) => {
  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.y = top;

  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(PDF_COLORS.text)
    .text("PixelEye Lead Export", left, top, {
      width: contentWidth,
      align: "left",
    });

  const headerLines = buildPdfHeaderLines(
    filters,
    generatedAt,
    summary.totalLeads,
  );
  const titleHeight = doc.heightOfString("PixelEye Lead Export", {
    width: contentWidth,
  });
  const metaY = top + titleHeight + 4;
  const metaLine = `${headerLines.generated} | ${headerLines.filters} | ${headerLines.total}`;

  doc
    .font("Helvetica")
    .fontSize(8.4)
    .fillColor(PDF_COLORS.muted)
    .text(metaLine, left, metaY, {
      width: contentWidth,
      lineGap: 1,
    });

  const metaHeight = doc.heightOfString(metaLine, {
    width: contentWidth,
    lineGap: 1,
  });
  const bottomY = metaY + metaHeight + 6;

  doc
    .moveTo(left, bottomY)
    .lineTo(left + contentWidth, bottomY)
    .strokeColor(PDF_COLORS.headerLine)
    .lineWidth(1)
    .stroke();

  return bottomY;
};

const drawPdfFooter = (doc, pageNumber, pageCount) => {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const footerY = doc.page.height - doc.page.margins.bottom + 2;

  doc
    .moveTo(left, footerY - 6)
    .lineTo(left + width, footerY - 6)
    .strokeColor(PDF_COLORS.headerLine)
    .lineWidth(1)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(PDF_COLORS.muted)
    .text(`Page ${pageNumber} of ${pageCount}`, left, footerY, {
      width,
      align: "right",
    });
};

const createPdfPayload = (leads, filters) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: PDF_LAYOUT.margin,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const generatedAt = new Date();
    const summary = buildPdfSummary(leads);
    const contentLeft = doc.page.margins.left;
    const contentWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableWidth = PDF_TABLE_COLUMNS.reduce(
      (total, column) => total + column.width,
      0,
    );
    const tableLeft =
      contentLeft + Math.max((contentWidth - tableWidth) / 2, 0);
    const contentBottom = () =>
      doc.page.height - doc.page.margins.bottom - PDF_LAYOUT.footerHeight;

    const renderHeader = () => {
      const headerBottom = drawPdfHeader(doc, filters, generatedAt, summary);
      doc.y = drawPdfTableHeader(
        doc,
        tableLeft,
        headerBottom + PDF_LAYOUT.headerBottomGap,
      );
      return doc.y;
    };

    doc.on("pageAdded", () => {
      renderHeader();
    });

    let tableCursorY = renderHeader();

    if (leads.length === 0) {
      doc
        .rect(tableLeft, tableCursorY, tableWidth, 24)
        .fillAndStroke(PDF_COLORS.white, PDF_COLORS.border);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(PDF_COLORS.text)
        .text(
          "No records found for the selected filters.",
          tableLeft + PDF_LAYOUT.rowPaddingX,
          tableCursorY + 8,
          {
            width: tableWidth - PDF_LAYOUT.rowPaddingX * 2,
          },
        );

      const range = doc.bufferedPageRange();
      for (
        let index = range.start;
        index < range.start + range.count;
        index += 1
      ) {
        doc.switchToPage(index);
        drawPdfFooter(doc, index + 1, range.count);
      }

      doc.end();
      return;
    }

    leads.forEach((lead, index) => {
      const rowHeight = measurePdfTableRowHeight(doc, lead, index + 1);

      if (tableCursorY + rowHeight > contentBottom()) {
        doc.addPage();
        tableCursorY = doc.y;
      }

      drawPdfTableRow(doc, lead, index + 1, tableLeft, tableCursorY, rowHeight);
      tableCursorY += rowHeight;
      doc.y = tableCursorY;
    });

    const range = doc.bufferedPageRange();
    for (
      let index = range.start;
      index < range.start + range.count;
      index += 1
    ) {
      doc.switchToPage(index);
      drawPdfFooter(doc, index + 1, range.count);
    }

    doc.end();
  });

const buildExportFileName = (format) => {
  const dateSegment = new Date().toISOString().slice(0, 10);
  return `pixel-eye-leads-${dateSegment}.${format}`;
};

const resolveClientIdFromKey = async (clientKeyRaw) => {
  try {
    return await resolveContextClientId({
      tenant: { isSuperAdmin: true },
      requestedClientKey: clientKeyRaw,
      expectedModuleKey: PIXEL_EYE_CLIENT_KEY,
    });
  } catch {
    return null;
  }
};

// Resolve client_id for super-admin who has no clientId in JWT
const resolveClientId = async (body, tenant) => {
  return resolveContextClientId({
    tenant,
    requestedClientKey: body._client_key || body.client_key,
    expectedModuleKey: PIXEL_EYE_CLIENT_KEY,
  });
};

const resolvePixelEyeTenant = (req) =>
  resolveScopedTenant({
    tenant: req.tenant,
    requestedClientKey: req.query._client_key || req.query.client_key,
    expectedModuleKey: PIXEL_EYE_CLIENT_KEY,
  });

const resolvePixelEyeErrorStatus = (message = "") => {
  const normalized = message.toLowerCase();

  if (normalized.includes("duplicate")) return 409;
  if (normalized.includes("unauthorized")) return 403;
  if (normalized.includes("not found")) return 404;
  if (
    normalized.includes("invalid day field") ||
    normalized.includes("both day and value") ||
    normalized.includes("validation") ||
    normalized.includes("follow_up_date") ||
    normalized.includes("manual follow-up") ||
    normalized.includes("all day status fields") ||
    normalized.includes("selected status is not allowed for day") ||
    normalized.includes("outcome flow is already completed") ||
    normalized.includes("cannot update") ||
    normalized.includes("follow-up endpoint") ||
    normalized.includes("cannot be rescheduled") ||
    normalized.includes("permanently closed")
  ) {
    return 400;
  }

  if (normalized.includes("no active follow-up reminder found")) return 404;

  return 500;
};

const hasOwnValue = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === "";

const normalizeHistoryMetadata = (metadata) => {
  if (metadata === null || metadata === undefined) {
    return null;
  }

  if (typeof metadata === "string") {
    const text = metadata.trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  return null;
};

const normalizeComplianceFilters = (query = {}) => ({
  compliance_status: String(query.compliance_status || "").trim() || undefined,
  from: String(query.from || "").trim() || undefined,
  to: String(query.to || "").trim() || undefined,
  agent_name: String(query.agent_name || "").trim() || undefined,
  limit: query.limit,
});

const getHistoryActor = (user) => ({
  trackFollowUpHistory: true,
  changed_by_user_id: user?.id ?? null,
  changed_by_name: user?.username || user?.email || null,
  source: "FRONTEND",
});

export const getLeads = async (req, res) => {
  try {
    const scopedTenant = await resolvePixelEyeTenant(req);
    const leads = await listPixelEyeLeads(scopedTenant);
    return res.status(200).json({ data: leads });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};

export const exportLeads = async (req, res) => {
  try {
    const format = String(req.query.format || "csv")
      .trim()
      .toLowerCase();
    if (!["csv", "pdf"].includes(format)) {
      return res.status(400).json({
        message: "Invalid format. Supported formats are csv and pdf.",
      });
    }

    const filters = normalizeExportFilters(req.query);
    const scopedTenant = await resolvePixelEyeTenant(req);
    const leads = await listPixelEyeLeadsForExport(
      scopedTenant,
      filters,
    );
    const fileName = buildExportFileName(format);

    if (format === "csv") {
      const csvPayload = createCsvPayload(leads);
      const csvBuffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(csvPayload, "utf8"),
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );
      return res.status(200).send(csvBuffer);
    }

    const pdfPayload = await createPdfPayload(leads, filters);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(pdfPayload);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};

export const getLeadById = async (req, res) => {
  try {
    const scopedTenant = await resolvePixelEyeTenant(req);
    const lead = await getPixelEyeLead(req.params.id, scopedTenant);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    return res.status(200).json({ data: lead });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};

export const getLeadFollowUpHistory = async (req, res) => {
  try {
    const lead = await getPixelEyeLead(req.params.id, req.tenant);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const historyRows = await getFollowUpHistoryForLead({
      client_id: lead.client_id,
      lead_id: lead.id,
      call_id: lead.call_id,
    });

    const history = historyRows.map((row) => ({
      old_follow_up_date: row.old_follow_up_date ?? null,
      new_follow_up_date: row.new_follow_up_date ?? null,
      change_type: row.change_type,
      reason: row.reason ?? null,
      changed_by_name: row.changed_by_name ?? null,
      source: row.source,
      metadata: normalizeHistoryMetadata(row.metadata),
      created_at: row.createdAt ?? row.created_at,
    }));

    return res.status(200).json({
      success: true,
      data: {
        lead_id: lead.id,
        call_id: lead.call_id,
        customer_name: lead.customer_name,
        phone_number: lead.phone_number,
        change_count: history.length,
        history,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const createLead = async (req, res) => {
  try {
    const clientId = await resolveClientId(req.body, req.tenant);
    const { _client_key, client_key, ...data } = req.body;
    if (!clientId) {
      return res.status(400).json({
        message:
          "Could not determine client context. Please contact your administrator.",
      });
    }

    const existingLead = await findPixelEyeLeadByPhone(
      clientId,
      data.phone_number,
    );

    if (existingLead) {
      const outcomeResult = await continuePixelEyeLeadFromManualCreate(
        existingLead,
        data,
        req.tenant,
      );
      const isManualFollowUpSignal =
        outcomeResult.result === "call_received_outcome_pending" ||
        outcomeResult.action === "manual_followup_signal_received" ||
        outcomeResult.result === "same_number_outcome_pending";

      return res.status(200).json({
        message: isManualFollowUpSignal
          ? "Same number matched an active lead. Please update the next day outcome manually."
          : "Duplicate phone number found. Existing lead continued with follow-up outcome.",
        isDuplicate: true,
        action: outcomeResult.action || "continued",
        result: outcomeResult.result || null,
        duplicateLeadId: existingLead.id,
        updated_day: outcomeResult.updated_day,
        outcome_status: outcomeResult.status,
        normal_lead_attention_state:
          outcomeResult.normal_lead_attention_state || null,
        normal_lead_attention_label:
          outcomeResult.normal_lead_attention_label || null,
        needs_manual_day_outcome: Boolean(
          outcomeResult.needs_manual_day_outcome,
        ),
        data: outcomeResult.lead,
      });
    }

    const lead = await createPixelEyeLead(
      data,
      clientId,
      getHistoryActor(req.user),
    );
    return res.status(201).json({
      message: "Lead created successfully",
      isDuplicate: false,
      action: "created",
      data: lead,
    });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateLead = async (req, res) => {
  try {
    const scopedTenant = await resolvePixelEyeTenant(req);
    const currentLead = await getPixelEyeLead(req.params.id, scopedTenant);
    if (!currentLead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    if (req.body.phone_number) {
      const duplicateLead = await findPixelEyeLeadByPhone(
        currentLead.client_id,
        req.body.phone_number,
      );

      if (
        duplicateLead &&
        Number(duplicateLead.id) !== Number(currentLead.id)
      ) {
        return res.status(409).json({
          message: "Duplicate phone number already exists for another lead",
          isDuplicate: true,
          duplicateLeadId: duplicateLead.id,
        });
      }
    }

    const lead = await updatePixelEyeLead(
      req.params.id,
      req.body,
      scopedTenant,
      getHistoryActor(req.user),
    );
    return res
      .status(200)
      .json({ message: "Lead updated successfully", data: lead });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateLeadFollowUpOutcome = async (req, res) => {
  try {
    const result = await updatePixelEyeFollowUpOutcome(
      req.params.id,
      req.body.status,
      req.tenant,
    );

    return res.status(200).json({
      success: true,
      message: "Follow-up outcome updated",
      data: result,
    });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const scopedTenant = await resolvePixelEyeTenant(req);

    if (!scopedTenant.isSuperAdmin && !scopedTenant.id) {
      return res
        .status(403)
        .json({ message: "You don't have permission to manage this resource" });
    }

    await deletePixelEyeLead(req.params.id, scopedTenant);
    return res.status(200).json({ message: "Lead deleted successfully" });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const markLeadFollowUpHandled = async (req, res) => {
  return res.status(410).json({
    message:
      "Mark Handled is no longer supported. Please update outcome, reschedule, or cancel the follow-up.",
  });
};

export const rescheduleLeadFollowUp = async (req, res) => {
  try {
    const result = await reschedulePixelEyeFollowUp(
      req.params.id,
      req.tenant,
      req.body || {},
      getHistoryActor(req.user),
    );

    return res.status(200).json({
      message: "Follow-up rescheduled successfully",
      data: result,
    });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const cancelLeadFollowUp = async (req, res) => {
  try {
    const result = await cancelPixelEyeFollowUp(
      req.params.id,
      req.tenant,
      req.body || {},
      getHistoryActor(req.user),
    );

    return res.status(200).json({
      message: result.hadReminder
        ? "Follow-up cancelled successfully"
        : "No active follow-up reminder found",
      data: result,
    });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

const resolveNotificationClientId = async (req) => {
  if (req.tenant.id) return req.tenant.id;
  return resolveClientIdFromKey(req.query._client_key || req.query.client_key);
};

export const getNotifications = async (req, res) => {
  try {
    const clientId = await resolveNotificationClientId(req);
    if (!clientId) {
      return res
        .status(400)
        .json({ message: "Could not determine client context." });
    }

    const filters = {
      state: String(req.query.state || "").trim() || undefined,
      schedule_type: String(req.query.schedule_type || "").trim() || undefined,
      limit: req.query.limit,
    };

    const states = await listNotificationStates(clientId, filters);
    return res.status(200).json({ data: states });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getNotificationsSummary = async (req, res) => {
  try {
    const clientId = await resolveNotificationClientId(req);
    if (!clientId) {
      return res
        .status(400)
        .json({ message: "Could not determine client context." });
    }

    const summary = await getNotificationSummary(clientId);
    return res.status(200).json({ data: summary });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteNotifications = async (req, res) => {
  try {
    const clientId = await resolveNotificationClientId(req);
    if (!clientId) {
      return res
        .status(400)
        .json({ message: "Could not determine client context." });
    }

    const notificationIds = Array.isArray(req.body?.ids)
      ? req.body.ids
      : req.body?.id != null
        ? [req.body.id]
        : [];

    if (notificationIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Select at least one notification." });
    }

    const result = await deleteNotificationStates(clientId, notificationIds);

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: "No matching notifications found." });
    }

    return res.status(200).json({
      message:
        result.deletedCount === 1
          ? "Notification deleted successfully"
          : `${result.deletedCount} notifications deleted successfully`,
      data: result,
    });
  } catch (err) {
    const status =
      err.message === "At least one notification id is required." ? 400 : 500;
    return res.status(status).json({ message: err.message });
  }
};

const resolveComplianceTenant = (req) => req.tenant;

const resolveComplianceClientId = async (req) => {
  const requestedClientKey = req.query._client_key || req.query.client_key;
  if (req.tenant.isSuperAdmin && requestedClientKey) {
    return await resolveClientIdFromKey(requestedClientKey);
  }

  return req.tenant.id || null;
};

export const getFollowUpCallCompliance = async (req, res) => {
  try {
    const clientId = await resolveComplianceClientId(req);
    if (
      req.tenant.isSuperAdmin &&
      (req.query._client_key || req.query.client_key) &&
      !clientId
    ) {
      return res
        .status(400)
        .json({ message: "Could not determine client context." });
    }

    const rows = await listFollowUpCallCompliance({
      tenant: resolveComplianceTenant(req),
      filters: {
        ...normalizeComplianceFilters(req.query),
        client_id: clientId || undefined,
      },
    });

    return res.status(200).json({ data: rows });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getMissedFollowUpCalls = async (req, res) => {
  try {
    const clientId = await resolveComplianceClientId(req);
    if (
      req.tenant.isSuperAdmin &&
      (req.query._client_key || req.query.client_key) &&
      !clientId
    ) {
      return res
        .status(400)
        .json({ message: "Could not determine client context." });
    }

    const rows = await listMissedFollowUpCalls({
      tenant: resolveComplianceTenant(req),
      filters: {
        ...normalizeComplianceFilters(req.query),
        client_id: clientId || undefined,
      },
    });

    return res.status(200).json({ data: rows });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getFollowUpCallComplianceSummary = async (req, res) => {
  try {
    const clientId = await resolveComplianceClientId(req);
    if (
      req.tenant.isSuperAdmin &&
      (req.query._client_key || req.query.client_key) &&
      !clientId
    ) {
      return res
        .status(400)
        .json({ message: "Could not determine client context." });
    }

    const summary = await getFollowUpCallComplianceSummaryService({
      tenant: resolveComplianceTenant(req),
      filters: {
        ...normalizeComplianceFilters(req.query),
        client_id: clientId || undefined,
      },
    });

    return res.status(200).json({ data: summary });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getFollowUpLifecycleSummary = async (req, res) => {
  try {
    const clientId = await resolveComplianceClientId(req);
    if (
      req.tenant.isSuperAdmin &&
      (req.query._client_key || req.query.client_key) &&
      !clientId
    ) {
      return res
        .status(400)
        .json({ message: "Could not determine client context." });
    }

    const summary = await getFollowUpLifecycleSummaryService({
      tenant: resolveComplianceTenant(req),
      clientId: clientId || undefined,
      filters: normalizeComplianceFilters(req.query),
    });

    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
