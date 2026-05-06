import db from "../../database/index.js";
import { tenantSafe } from "../../utils/tenantContext.js";
import { Op } from "sequelize";
import {
  extractClientModuleKey,
  normalizeClientKey,
} from "../../utils/clientKey.js";
import { getDynamicModel } from "./modelRegistry.js";

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

const resolveClientId = async (tenant, payload) => {
  if (!tenant.isSuperAdmin) {
    return tenant.id;
  }

  const clientKeyRaw = payload._client_key || payload.client_key;
  if (!clientKeyRaw) return null;

  return resolveClientIdFromKey(clientKeyRaw);
};

const ensureModel = (modelKey) => {
  const model = getDynamicModel(modelKey);
  if (!model) {
    throw new Error("Model not found");
  }
  return model;
};

export const listDynamicRecords = async (modelKey, tenant) => {
  const model = ensureModel(modelKey);
  const safeModel = tenantSafe(model, tenant);

  return await safeModel.findAll({
    order: [["createdAt", "DESC"]],
  });
};

export const getDynamicRecord = async (modelKey, id, tenant) => {
  const model = ensureModel(modelKey);
  const safeModel = tenantSafe(model, tenant);

  return await safeModel.findOne({ where: { id } });
};

export const createDynamicRecord = async (modelKey, data, tenant) => {
  const model = ensureModel(modelKey);
  const payload = { ...data };

  const clientId = await resolveClientId(tenant, payload);
  if (!clientId) {
    throw new Error("Could not determine client context");
  }

  delete payload._client_key;
  delete payload.client_key;

  return await model.create({
    ...payload,
    client_id: clientId,
  });
};

export const updateDynamicRecord = async (modelKey, id, data, tenant) => {
  const model = ensureModel(modelKey);
  const safeModel = tenantSafe(model, tenant);

  const record = await safeModel.findOne({ where: { id } });
  if (!record) {
    throw new Error("Record not found");
  }

  const payload = { ...data };
  delete payload._client_key;
  delete payload.client_key;

  if (!tenant.isSuperAdmin) {
    delete payload.client_id;
  }

  return await record.update(payload);
};

export const deleteDynamicRecord = async (modelKey, id, tenant) => {
  const model = ensureModel(modelKey);
  const safeModel = tenantSafe(model, tenant);

  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) {
    throw new Error("Record not found");
  }

  return true;
};
