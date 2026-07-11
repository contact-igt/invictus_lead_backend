import { tenantSafe } from "../../utils/tenantContext.js";
import {
  resolveClientId,
  resolveScopedTenant,
} from "../../utils/resolveClientContext.js";
import { getDynamicModel } from "./modelRegistry.js";

const EXPECTED_CLIENT_MODULE = "vls_law";

const ensureModel = (modelKey) => {
  const model = getDynamicModel(modelKey);
  if (!model) {
    throw new Error("Model not found");
  }
  return model;
};

export const listDynamicRecords = async (modelKey, tenant, requestedClientKey) => {
  const model = ensureModel(modelKey);
  const scopedTenant = await resolveScopedTenant({ tenant, requestedClientKey, expectedModuleKey: EXPECTED_CLIENT_MODULE });
  const safeModel = tenantSafe(model, scopedTenant);

  return await safeModel.findAll({
    order: [["createdAt", "DESC"]],
  });
};

export const getDynamicRecord = async (modelKey, id, tenant, requestedClientKey) => {
  const model = ensureModel(modelKey);
  const scopedTenant = await resolveScopedTenant({ tenant, requestedClientKey, expectedModuleKey: EXPECTED_CLIENT_MODULE });
  const safeModel = tenantSafe(model, scopedTenant);

  return await safeModel.findOne({ where: { id } });
};

export const createDynamicRecord = async (modelKey, data, tenant, requestedClientKey) => {
  const model = ensureModel(modelKey);
  const payload = { ...data };

  const clientId = await resolveClientId({
    tenant,
    requestedClientKey:
      requestedClientKey || payload._client_key || payload.client_key,
    expectedModuleKey: EXPECTED_CLIENT_MODULE,
  });

  delete payload._client_key;
  delete payload.client_key;

  return await model.create({
    ...payload,
    client_id: clientId,
  });
};

export const updateDynamicRecord = async (modelKey, id, data, tenant, requestedClientKey) => {
  const model = ensureModel(modelKey);
  const scopedTenant = await resolveScopedTenant({ tenant, requestedClientKey, expectedModuleKey: EXPECTED_CLIENT_MODULE });
  const safeModel = tenantSafe(model, scopedTenant);

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

export const deleteDynamicRecord = async (modelKey, id, tenant, requestedClientKey) => {
  const model = ensureModel(modelKey);
  const scopedTenant = await resolveScopedTenant({ tenant, requestedClientKey, expectedModuleKey: EXPECTED_CLIENT_MODULE });
  const safeModel = tenantSafe(model, scopedTenant);

  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) {
    throw new Error("Record not found");
  }

  return true;
};
