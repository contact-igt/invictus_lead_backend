import {
  listPixelEyeLeads,
  listPixelEyeLeadsForExport,
  getPixelEyeLead,
  createPixelEyeLead,
  findPixelEyeLeadByPhone,
  updatePixelEyeLead,
  deletePixelEyeLead,
  markPixelEyeFollowUpHandled,
  reschedulePixelEyeFollowUp,
  cancelPixelEyeFollowUp,
} from "./pixelEye.service.js";
import {
  listNotificationStates,
  getNotificationSummary,
} from "./pixelEyeNotification.service.js";
import db from "../../database/index.js";
import { Op } from "sequelize";
import PDFDocument from "pdfkit";
import {
  extractClientModuleKey,
  normalizeClientKey,
} from "../../utils/clientKey.js";

const EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "call_id", label: "Call ID" },
  { key: "customer_name", label: "Customer Name" },
  { key: "phone_number", label: "Phone Number" },
  { key: "agent_name", label: "Agent Name" },
  { key: "source", label: "Source" },
  { key: "type_of_enquiry", label: "Type Of Enquiry" },
  { key: "follow_up_date", label: "Follow-up Date" },
  { key: "status", label: "Status" },
  { key: "day_1", label: "Day 1" },
  { key: "day_2", label: "Day 2" },
  { key: "day_3", label: "Day 3" },
  { key: "day_4", label: "Day 4" },
  { key: "day_5", label: "Day 5" },
];

const formatDateValue = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  const isoDateMatch = text.match(/^\d{4}-\d{2}-\d{2}/);
  return isoDateMatch ? isoDateMatch[0] : text;
};

const normalizeExportFilters = (query = {}) => ({
  dateFrom: String(query.dateFrom || "").trim(),
  dateTo: String(query.dateTo || "").trim(),
  agent: String(query.agent || "").trim(),
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

const serializeLeadField = (lead, key) => {
  if (key === "follow_up_date" || key === "date") {
    return formatDateValue(lead?.[key]);
  }
  return lead?.[key] ?? "";
};

const createCsvPayload = (leads) => {
  const headers = EXPORT_COLUMNS.map((column) => column.label).join(",");
  const rows = leads.map((lead) =>
    EXPORT_COLUMNS.map((column) =>
      escapeCsvValue(serializeLeadField(lead, column.key)),
    ).join(","),
  );

  return [headers, ...rows].join("\n");
};

const createFilterSummary = ({ dateFrom, dateTo, agent }) => {
  const activeFilters = [];
  if (dateFrom) activeFilters.push(`From: ${dateFrom}`);
  if (dateTo) activeFilters.push(`To: ${dateTo}`);
  if (agent) activeFilters.push(`Agent: ${agent}`);
  return activeFilters.length > 0 ? activeFilters.join(" | ") : "None";
};

const createPdfPayload = (leads, filters) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const createdAt = new Date().toISOString().replace("T", " ").slice(0, 19);

    doc.fontSize(16).text("PixelEye Overview Export", { align: "left" });
    doc.moveDown(0.4);
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(`Generated: ${createdAt}`)
      .text(`Filters: ${createFilterSummary(filters)}`)
      .text(`Total Records: ${leads.length}`);

    doc.moveDown(0.8);
    doc.fillColor("#111");

    if (leads.length === 0) {
      doc.fontSize(12).text("No records found for selected filters.");
      doc.end();
      return;
    }

    leads.forEach((lead, index) => {
      if (doc.y > 730) {
        doc.addPage();
      }

      doc
        .fontSize(11)
        .fillColor("#111")
        .text(
          `${index + 1}. ${lead.customer_name || "Unknown"} (${lead.phone_number || "N/A"})`,
        );

      doc
        .fontSize(9)
        .fillColor("#444")
        .text(
          `Date: ${formatDateValue(lead.date)} | Time: ${lead.time || "-"} | Status: ${lead.status || "-"}`,
        )
        .text(
          `Call ID: ${lead.call_id || "-"} | Agent: ${lead.agent_name || "Unassigned"} | Source: ${lead.source || "-"}`,
        )
        .text(
          `Enquiry: ${lead.type_of_enquiry || "-"} | Follow-up: ${formatDateValue(lead.follow_up_date) || "-"}`,
        )
        .text(
          `Day Flow: ${lead.day_1 || "-"}, ${lead.day_2 || "-"}, ${lead.day_3 || "-"}, ${lead.day_4 || "-"}, ${lead.day_5 || "-"}`,
        );

      doc.moveDown(0.6);
    });

    doc.end();
  });

const buildExportFileName = (format) => {
  const dateSegment = new Date().toISOString().slice(0, 10);
  return `pixeleye-overview-${dateSegment}.${format}`;
};

const resolveClientIdFromKey = async (clientKeyRaw) => {
  const clientKey = normalizeClientKey(clientKeyRaw);
  if (!clientKey) return null;

  const exactClient = await db.Client.findOne({
    where: { client_key: clientKey },
  });
  if (exactClient) return exactClient.id;

  const moduleKey = extractClientModuleKey(clientKey);
  if (!moduleKey || moduleKey !== clientKey) {
    return null;
  }

  const matchedClients = await db.Client.findAll({
    where: {
      client_key: {
        [Op.like]: `${moduleKey}_%`,
      },
    },
    order: [["id", "ASC"]],
  });

  if (matchedClients.length === 1) {
    return matchedClients[0].id;
  }

  return null;
};

// Resolve client_id for super-admin who has no clientId in JWT
const resolveClientId = async (body, tenant) => {
  if (tenant.id) return tenant.id;

  return resolveClientIdFromKey(body._client_key || body.client_key);
};

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
    normalized.includes("cannot update") ||
    normalized.includes("cannot be rescheduled") ||
    normalized.includes("permanently closed")
  ) {
    return 400;
  }

  if (normalized.includes("no active follow-up reminder found")) return 404;

  return 500;
};

export const getLeads = async (req, res) => {
  try {
    const requestedClientKey = req.query._client_key || req.query.client_key;
    const clientId = req.tenant.isSuperAdmin && requestedClientKey
      ? await resolveClientIdFromKey(requestedClientKey)
      : null;
    if (req.tenant.isSuperAdmin && requestedClientKey && !clientId) {
      return res.status(400).json({ message: "Could not determine client context." });
    }
    const leads = await listPixelEyeLeads(req.tenant, clientId);
    return res.status(200).json({ data: leads });
  } catch (err) {
    return res.status(500).json({ message: err.message });
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
    const requestedClientKey = req.query._client_key || req.query.client_key;
    const clientId = req.tenant.isSuperAdmin && requestedClientKey
      ? await resolveClientIdFromKey(requestedClientKey)
      : null;
    if (req.tenant.isSuperAdmin && requestedClientKey && !clientId) {
      return res.status(400).json({ message: "Could not determine client context." });
    }
    const leads = await listPixelEyeLeadsForExport(req.tenant, filters, clientId);
    const fileName = buildExportFileName(format);

    if (format === "csv") {
      const csvPayload = createCsvPayload(leads);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );
      return res.status(200).send(csvPayload);
    }

    const pdfPayload = await createPdfPayload(leads, filters);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(pdfPayload);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getLeadById = async (req, res) => {
  try {
    const lead = await getPixelEyeLead(req.params.id, req.tenant);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    return res.status(200).json({ data: lead });
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
      const updatedLead = await updatePixelEyeLead(
        existingLead.id,
        data,
        req.tenant,
      );

      return res.status(200).json({
        message: "Duplicate phone number found. Existing lead updated.",
        isDuplicate: true,
        duplicateLeadId: existingLead.id,
        data: updatedLead,
      });
    }

    const lead = await createPixelEyeLead(data, clientId);
    return res.status(201).json({
      message: "Lead created successfully",
      isDuplicate: false,
      data: lead,
    });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateLead = async (req, res) => {
  try {
    const currentLead = await getPixelEyeLead(req.params.id, req.tenant);
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

    const lead = await updatePixelEyeLead(req.params.id, req.body, req.tenant);
    return res
      .status(200)
      .json({ message: "Lead updated successfully", data: lead });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    await deletePixelEyeLead(req.params.id, req.tenant);
    return res.status(200).json({ message: "Lead deleted successfully" });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const markLeadFollowUpHandled = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = await markPixelEyeFollowUpHandled(
      req.params.id,
      req.tenant,
      reason,
    );

    return res.status(200).json({
      message: "Follow-up marked as handled",
      data: result,
    });
  } catch (err) {
    const status = resolvePixelEyeErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const rescheduleLeadFollowUp = async (req, res) => {
  try {
    const result = await reschedulePixelEyeFollowUp(
      req.params.id,
      req.tenant,
      req.body || {},
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
      return res.status(400).json({ message: "Could not determine client context." });
    }

    const filters = {
      state:         String(req.query.state         || "").trim() || undefined,
      schedule_type: String(req.query.schedule_type || "").trim() || undefined,
      limit:         req.query.limit,
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
      return res.status(400).json({ message: "Could not determine client context." });
    }

    const summary = await getNotificationSummary(clientId);
    return res.status(200).json({ data: summary });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
