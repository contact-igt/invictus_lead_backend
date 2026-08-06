import { Op } from "sequelize";
import db from "../../../database/index.js";
import { tenantSafe } from "../../../utils/tenantContext.js";
import { normalizeClientKey, extractClientModuleKey } from "../../../utils/clientKey.js";

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

export const registerVlsDopAiAssisted = async (data, clientId) => {
  const {
    name,
    email,
    mobile,
    amount,
    programm_date,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    payment_status,
    captured,
    page_name,
    ip_address,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
  } = data;

  return await db.VlsDopAiAssisted.create({
    client_id: clientId,
    name: name ?? null,
    email: email ?? null,
    mobile,
    amount: amount ?? null,
    programm_date: programm_date ?? null,
    registered_date: new Date(),
    razorpay_order_id: razorpay_order_id ?? null,
    razorpay_payment_id: razorpay_payment_id ?? null,
    razorpay_signature: razorpay_signature ?? null,
    payment_status: payment_status || "attempted",
    captured: captured !== undefined && captured !== null ? String(captured) : null,
    page_name: page_name ?? "decoding-of-practice",
    ip_address: ip_address ?? null,
    utm_source: utm_source ?? null,
    utm_medium: utm_medium ?? null,
    utm_campaign: utm_campaign ?? null,
    utm_term: utm_term ?? null,
    utm_content: utm_content ?? null,
  });
};

export const createVlsDopAiAssistedByAdmin = async (data, tenant) => {
  let clientId = tenant.id;
  if (tenant.isSuperAdmin) {
    const clientKeyRaw = data._client_key || data.client_key;
    clientId = clientKeyRaw ? await resolveClientIdFromKey(clientKeyRaw) : null;
  }
  if (!clientId) throw new Error("Unable to resolve client_id for this record");

  const {
    /* eslint-disable no-unused-vars */
    _client_key: _ck,
    client_key: _ckey,
    /* eslint-enable no-unused-vars */
    name,
    email,
    mobile,
    amount,
    programm_date,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    payment_status,
    captured,
    page_name,
    ip_address,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
  } = data;

  return await db.VlsDopAiAssisted.create({
    client_id: clientId,
    name: name ?? null,
    email: email ?? null,
    mobile,
    amount: amount ?? null,
    programm_date: programm_date ?? null,
    registered_date: new Date(),
    razorpay_order_id: razorpay_order_id ?? null,
    razorpay_payment_id: razorpay_payment_id ?? null,
    razorpay_signature: razorpay_signature ?? null,
    payment_status: payment_status || "attempted",
    captured: captured !== undefined && captured !== null ? String(captured) : null,
    page_name: page_name ?? "decoding-of-practice",
    ip_address: ip_address ?? null,
    utm_source: utm_source ?? null,
    utm_medium: utm_medium ?? null,
    utm_campaign: utm_campaign ?? null,
    utm_term: utm_term ?? null,
    utm_content: utm_content ?? null,
  });
};

export const updateVlsDopAiAssistedById = async (id, data, tenant) => {
  const safeModel = tenantSafe(db.VlsDopAiAssisted, tenant);
  const record = await safeModel.findOne({ where: { id } });
  if (!record) throw new Error("Record not found");
  return await record.update(data);
};

export const listVlsDopAiAssisted = async (tenant) => {
  const safeModel = tenantSafe(db.VlsDopAiAssisted, tenant);
  return await safeModel.findAll({ order: [["createdAt", "DESC"]] });
};

export const getVlsDopAiAssistedById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsDopAiAssisted, tenant);
  return await safeModel.findOne({ where: { id } });
};

export const deleteVlsDopAiAssistedById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsDopAiAssisted, tenant);
  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) throw new Error("Record not found");
  return true;
};
