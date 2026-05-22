import { Op } from "sequelize";
import db from "../../../database/index.js";
import { tenantSafe } from "../../../utils/tenantContext.js";
import { normalizeClientKey, extractClientModuleKey } from "../../../utils/clientKey.js";

/**
 * Resolve a client_id from a raw client key string (for super-admin context).
 * Reuses same logic as other VLS modules.
 */
const resolveClientIdFromKey = async (clientKeyRaw) => {
  const clientKey = normalizeClientKey(clientKeyRaw);
  if (!clientKey) return null;

  const exactClient = await db.Client.findOne({ where: { client_key: clientKey } });
  if (exactClient) return exactClient.id;

  const moduleKey = extractClientModuleKey(clientKey);
  if (!moduleKey || moduleKey !== clientKey) return null;

  const matchedClients = await db.Client.findAll({
    where: { client_key: { [Op.like]: `${moduleKey}_%` } },
    order: [["id", "ASC"]],
  });

  return matchedClients.length === 1 ? matchedClients[0].id : null;
};

/**
 * Public registration: create a vls_aibe record for a public client key.
 */
export const registerVlsAibe = async (data, clientId) => {
  const {
    name,
    email,
    mobile,
    amount,
    programm_start_date,
    programm_end_date,
    payment_status,
    captured,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    ip_address,
    utm_source,
  } = data;
  const payload = {
    client_id: clientId,
    name,
    email,
    mobile,
    amount: amount ?? null,
    programm_start_date: programm_start_date ?? null,
    programm_end_date: programm_end_date ?? null,
    registered_date: new Date(),
    ip_address: ip_address ?? null,
    utm_source: utm_source ?? null,
  };

  if (razorpay_order_id) payload.razorpay_order_id = razorpay_order_id;
  if (razorpay_payment_id) payload.razorpay_payment_id = razorpay_payment_id;
  if (razorpay_signature) payload.razorpay_signature = razorpay_signature;
  if (payment_status !== undefined && payment_status !== null && payment_status !== "") payload.payment_status = payment_status;
  if (typeof captured !== "undefined") payload.captured = captured;

  return await db.VlsLawAibe.create(payload);
};

/**
 * Create a record from the admin panel (tenant-scoped). Super-admin can pass _client_key to create for another client.
 */
export const createVlsAibeByAdmin = async (data, tenant) => {
  let clientId = tenant.id;
  if (tenant.isSuperAdmin) {
    const clientKeyRaw = data._client_key || data.client_key;
    clientId = clientKeyRaw ? await resolveClientIdFromKey(clientKeyRaw) : null;
  }
  if (!clientId) throw new Error("Unable to resolve client_id for this record");

  const {
    _client_key: _ck,
    client_key: _ckey,
    name,
    email,
    mobile,
    amount,
    programm_start_date,
    programm_end_date,
    payment_status,
    captured,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    ip_address,
    utm_source,
  } = data;
  const payload = {
    client_id: clientId,
    name,
    email,
    mobile,
    amount: amount ?? null,
    programm_start_date: programm_start_date ?? null,
    programm_end_date: programm_end_date ?? null,
    registered_date: new Date(),
    ip_address: ip_address ?? null,
    utm_source: utm_source ?? null,
  };

  if (razorpay_order_id) payload.razorpay_order_id = razorpay_order_id;
  if (razorpay_payment_id) payload.razorpay_payment_id = razorpay_payment_id;
  if (razorpay_signature) payload.razorpay_signature = razorpay_signature;
  if (payment_status !== undefined && payment_status !== null && payment_status !== "") payload.payment_status = payment_status;
  if (typeof captured !== "undefined") payload.captured = captured;

  return await db.VlsLawAibe.create(payload);
};

export const updateVlsAibeById = async (id, data, tenant) => {
  const safeModel = tenantSafe(db.VlsLawAibe, tenant);
  const record = await safeModel.findOne({ where: { id } });
  if (!record) throw new Error("Record not found");
  return await record.update(data);
};

export const listVlsAibe = async (tenant) => {
  const safeModel = tenantSafe(db.VlsLawAibe, tenant);
  return await safeModel.findAll({ order: [["createdAt", "DESC"]] });
};

export const getVlsAibeById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsLawAibe, tenant);
  return await safeModel.findOne({ where: { id } });
};

export const deleteVlsAibeById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsLawAibe, tenant);
  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) throw new Error("Record not found");
  return true;
};
