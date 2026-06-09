import db from "../../database/index.js";
import { tenantSafe } from "../../utils/tenantContext.js";
import { Op, col, fn, where } from "sequelize";
import { processLeadStatus, processDayStatus } from "./pixelEyeNotification.service.js";

const buildLeadFilters = ({ dateFrom, dateTo, agent } = {}) => {
  const filters = {};

  const normalizedDateFrom = String(dateFrom || "").trim();
  const normalizedDateTo = String(dateTo || "").trim();
  const normalizedAgent = String(agent || "").trim();

  if (normalizedDateFrom && normalizedDateTo) {
    filters.date = { [Op.between]: [normalizedDateFrom, normalizedDateTo] };
  } else if (normalizedDateFrom) {
    filters.date = { [Op.gte]: normalizedDateFrom };
  } else if (normalizedDateTo) {
    filters.date = { [Op.lte]: normalizedDateTo };
  }

  if (normalizedAgent) {
    filters.agent_name = normalizedAgent;
  }

  return filters;
};

const normalizePhone = (phone) =>
  String(phone || "")
    .trim()
    .replace(/\D/g, "");

export const listPixelEyeLeads = async (tenantContext) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  return await safeModel.findAll({
    order: [["createdAt", "DESC"]],
  });
};

export const listPixelEyeLeadsForExport = async (
  tenantContext,
  queryFilters = {},
) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const whereFilters = buildLeadFilters(queryFilters);

  return await safeModel.findAll({
    where: whereFilters,
    order: [
      ["date", "ASC"],
      ["time", "ASC"],
      ["id", "ASC"],
    ],
  });
};

export const getPixelEyeLead = async (id, tenantContext) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  return await safeModel.findOne({ where: { id } });
};

export const createPixelEyeLead = async (data, clientId) => {
  const lead = await db.PixelEye.create({ ...data, client_id: clientId });
  // Fire-and-forget: schedule callback based on initial status.
  processLeadStatus(lead, clientId, "create").catch((err) =>
    console.error(`[PixelEye] processLeadStatus(create) failed for call_id=${lead?.call_id}:`, err?.message),
  );
  return lead;
};

export const findPixelEyeLeadByPhone = async (clientId, phoneNumber) => {
  const rawPhone = String(phoneNumber || "").trim();
  if (!rawPhone) return null;

  const exactMatch = await db.PixelEye.findOne({
    where: { client_id: clientId, phone_number: rawPhone },
    order: [["createdAt", "DESC"]],
  });

  if (exactMatch) {
    return exactMatch;
  }

  const normalizedIncoming = normalizePhone(rawPhone);
  if (!normalizedIncoming) return null;
  const incomingLast10 =
    normalizedIncoming.length > 10
      ? normalizedIncoming.slice(-10)
      : normalizedIncoming;

  const normalizedDbPhone = fn(
    "REPLACE",
    fn(
      "REPLACE",
      fn(
        "REPLACE",
        fn("REPLACE", fn("REPLACE", col("phone_number"), " ", ""), "-", ""),
        "+",
        "",
      ),
      "(",
      "",
    ),
    ")",
    "",
  );

  const lead = await db.PixelEye.findOne({
    where: {
      client_id: clientId,
      [Op.or]: [
        where(normalizedDbPhone, normalizedIncoming),
        where(fn("RIGHT", normalizedDbPhone, 10), incomingLast10),
      ],
    },
    order: [["createdAt", "DESC"]],
  });

  return lead;
};

export const updatePixelEyeLead = async (id, data, tenantContext) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const lead = await safeModel.findOne({ where: { id } });

  if (!lead) throw new Error("Lead not found or unauthorized");

  let updateData = { ...data };
  const hasDay = Object.prototype.hasOwnProperty.call(data, "day");
  const hasValue = Object.prototype.hasOwnProperty.call(data, "value");

  if (hasDay !== hasValue) {
    throw new Error("Both day and value are required for day updates");
  }

  if (hasDay && hasValue) {
    const dayField = ["day_1", "day_2", "day_3", "day_4", "day_5"].includes(
      data.day,
    )
      ? data.day
      : null;

    if (!dayField) {
      throw new Error("Invalid day field");
    }

    updateData = { ...updateData, [dayField]: data.value };
    delete updateData.day;
    delete updateData.value;
  }

  // Prevent tenant hijacking during update
  if (!tenantContext.isSuperAdmin) {
    delete updateData.client_id;
  }

  const statusBefore = lead.status;
  const updatedLead  = await lead.update(updateData);

  // Trigger notification logic only when the status field changed.
  if (
    Object.prototype.hasOwnProperty.call(updateData, "status") &&
    updateData.status !== statusBefore
  ) {
    processLeadStatus(updatedLead, updatedLead.client_id, "update").catch((err) =>
      console.error(`[PixelEye] processLeadStatus(update) failed for call_id=${updatedLead?.call_id}:`, err?.message),
    );
  }

  // Trigger notification logic when a day field is manually updated.
  const DAY_FIELDS = ["day_1", "day_2", "day_3", "day_4", "day_5"];
  for (const dayField of DAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updateData, dayField) && updateData[dayField]) {
      const dayNumber = parseInt(dayField.split("_")[1], 10);
      processDayStatus(updatedLead, updatedLead.client_id, dayNumber, updateData[dayField])
        .catch((err) =>
          console.error(
            `[PixelEye] processDayStatus(${dayField}) failed for call_id=${updatedLead?.call_id}:`,
            err?.message,
          ),
        );
      break; // Only one day field should change per API request
    }
  }

  return updatedLead;
};

export const deletePixelEyeLead = async (id, tenantContext) => {
  const safeModel = tenantSafe(db.PixelEye, tenantContext);
  const deleted = await safeModel.destroy({ where: { id } });

  if (!deleted) throw new Error("Lead not found or unauthorized");
  return true;
};
