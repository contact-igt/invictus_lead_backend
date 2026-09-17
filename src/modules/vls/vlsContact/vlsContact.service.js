import db from "../../../database/index.js";
import { tenantSafe } from "../../../utils/tenantContext.js";
import { attemptSheetSync } from "../vlsSheetSync.service.js";

const buildFields = (data) => ({
  name: data.name,
  mobile: data.mobile ?? data.Number ?? null,
  email: data.email ?? null,
  message: data.message ?? data.comment ?? null,
  ip_address: data.ip_address ?? null,
  utm_source: data.utm_source ?? null,
});

export const registerVlsContact = async (data, clientId) => {
  const record = await db.VlsContact.create({
    client_id: clientId,
    ...buildFields(data),
  });

  // DB row is already committed; mirror into the Google Sheet next,
  // best-effort and non-blocking — the retry scheduler picks up failures.
  attemptSheetSync(record, "contact").catch(() => {});

  return record;
};

export const createVlsContactByAdmin = async (data, tenant) => {
  return await db.VlsContact.create({
    client_id: tenant.id,
    ...buildFields(data),
  });
};

export const updateVlsContactById = async (id, data, tenant) => {
  const safeModel = tenantSafe(db.VlsContact, tenant);
  const record = await safeModel.findOne({ where: { id } });
  if (!record) throw new Error("Record not found");
  return await record.update(buildFields(data));
};

export const listVlsContact = async (tenant) => {
  const safeModel = tenantSafe(db.VlsContact, tenant);
  return await safeModel.findAll({ order: [["createdAt", "DESC"]] });
};

export const getVlsContactById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsContact, tenant);
  return await safeModel.findOne({ where: { id } });
};

export const deleteVlsContactById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsContact, tenant);
  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) throw new Error("Record not found");
  return true;
};
