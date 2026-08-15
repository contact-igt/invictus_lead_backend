import { Op } from "sequelize";
import db from "../../../database/index.js";
import { tenantSafe } from "../../../utils/tenantContext.js";
import { normalizeClientKey, extractClientModuleKey } from "../../../utils/clientKey.js";

/**
 * Resolve a client_id from a raw client key string (for super-admin context).
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
 * Register a new VLS AI for Advocates record (public - called from landing page after payment).
 * @param {object} data - Validated payload from the public POST endpoint.
 * @param {number} clientId - Resolved client_id from X-Client-Key.
 */
export const registerVlsAiForAdvocates = async (data, clientId) => {
  const {
    name,
    email,
    mobile,
    yearsOfPractice,
    years_of_practice,
    experience,
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

  return await db.VlsAiForAdvocates.create({
    client_id: clientId,
    name,
    email,
    mobile,
    years_of_practice: yearsOfPractice ?? years_of_practice ?? experience ?? null,
    amount: (amount === "" || amount === null || amount === undefined) ? null : amount,
    programm_date: programm_date ?? null,
    registered_date: new Date(),
    razorpay_order_id: razorpay_order_id ?? null,
    razorpay_payment_id: razorpay_payment_id ?? null,
    razorpay_signature: razorpay_signature ?? null,
    payment_status,
    captured: (captured === "" || captured === null || captured === undefined) ? null : String(captured),
    page_name: page_name ?? "ai-for-advocates",
    ip_address: ip_address ?? null,
    utm_source: utm_source ?? null,
    utm_medium: utm_medium ?? null,
    utm_campaign: utm_campaign ?? null,
    utm_term: utm_term ?? null,
    utm_content: utm_content ?? null,
  });
};

/**
 * Create a VLS AI for Advocates record from the admin panel (authenticated, tenant-scoped).
 * @param {object} data - Validated payload from the admin POST endpoint.
 * @param {TenantContext} tenant - Authenticated tenant context.
 */
export const createVlsAiForAdvocatesByAdmin = async (data, tenant) => {
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
    yearsOfPractice,
    years_of_practice,
    experience,
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

  return await db.VlsAiForAdvocates.create({
    client_id: clientId,
    name,
    email,
    mobile,
    years_of_practice: yearsOfPractice ?? years_of_practice ?? experience ?? null,
    amount: (amount === "" || amount === null || amount === undefined) ? null : amount,
    programm_date: programm_date ?? null,
    registered_date: new Date(),
    razorpay_order_id: razorpay_order_id ?? null,
    razorpay_payment_id: razorpay_payment_id ?? null,
    razorpay_signature: razorpay_signature ?? null,
    payment_status,
    captured: (captured === "" || captured === null || captured === undefined) ? null : String(captured),
    page_name: page_name ?? "ai-for-advocates",
    ip_address: ip_address ?? null,
    utm_source: utm_source ?? null,
    utm_medium: utm_medium ?? null,
    utm_campaign: utm_campaign ?? null,
    utm_term: utm_term ?? null,
    utm_content: utm_content ?? null,
  });
};

/**
 * Update an existing VLS AI for Advocates record by id, scoped to the authenticated tenant.
 */
export const updateVlsAiForAdvocatesById = async (id, data, tenant) => {
  const safeModel = tenantSafe(db.VlsAiForAdvocates, tenant);
  const record = await safeModel.findOne({ where: { id } });
  if (!record) throw new Error("Record not found");
  return await record.update(data);
};

/**
 * List all VLS AI for Advocates records scoped to the authenticated tenant.
 */
export const listVlsAiForAdvocates = async (tenant) => {
  const safeModel = tenantSafe(db.VlsAiForAdvocates, tenant);
  return await safeModel.findAll({ order: [["createdAt", "DESC"]] });
};

/**
 * Fetch a single VLS AI for Advocates record by id, scoped to the authenticated tenant.
 */
export const getVlsAiForAdvocatesById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsAiForAdvocates, tenant);
  return await safeModel.findOne({ where: { id } });
};

/**
 * Delete a VLS AI for Advocates record by id, scoped to the authenticated tenant.
 */
export const deleteVlsAiForAdvocatesById = async (id, tenant) => {
  const safeModel = tenantSafe(db.VlsAiForAdvocates, tenant);
  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) throw new Error("Record not found");
  return true;
};
