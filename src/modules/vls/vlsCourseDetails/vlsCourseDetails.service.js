import db from "../../../database/index.js";
import { tenantSafe } from "../../../utils/tenantContext.js";
import { attemptSheetSync } from "../vlsSheetSync.service.js";

const buildFields = (data) => ({
  name: data.name ?? data.Name,
  mobile: data.mobile ?? data.Number ?? null,
  email: data.email ?? data.Email ?? null,
  course: data.course ?? data.Course,
  submission_type: data.submission_type,
  call_time: data.call_time ?? data.CallTime ?? null,
  class_mode: data.class_mode ?? data.ClassMode ?? null,
  ip_address: data.ip_address ?? null,
  utm_source: data.utm_source ?? null,
});

export const registerVlsCourseDetails = async (data, clientId) => {
  const record = await db.VlsCourseDetails.create({
    client_id: clientId,
    ...buildFields(data),
  });

  // DB row is already committed; mirror into the Google Sheet next,
  // best-effort and non-blocking — the retry scheduler picks up failures.
  attemptSheetSync(record, "course").catch(() => {});

  return record;
};

export const createVlsCourseDetailsByAdmin = async (data, tenant) => {
  return await db.VlsCourseDetails.create({
    client_id: tenant.id,
    ...buildFields(data),
  });
};

export const updateVlsCourseDetailsById = async (id, data, tenant) => {
  const safeModel = tenantSafe(db.VlsCourseDetails, tenant);
  const record = await safeModel.findOne({ where: { id } });
  if (!record) throw new Error("Record not found");
  return await record.update(buildFields(data));
};

export const listVlsCourseDetails = async (tenant) => {
  const safeModel = tenantSafe(db.VlsCourseDetails, tenant);
  return await safeModel.findAll({ order: [["createdAt", "DESC"]] });
};

export const getVlsCourseDetailsById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsCourseDetails, tenant);
  return await safeModel.findOne({ where: { id } });
};

export const deleteVlsCourseDetailsById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsCourseDetails, tenant);
  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) throw new Error("Record not found");
  return true;
};
