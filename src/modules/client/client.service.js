import db from "../../database/index.js";
import {
  isSupportedClientKey,
  normalizeClientKey,
  SUPPORTED_CLIENT_MODULES,
} from "../../utils/clientKey.js";

const normalizeClientPayload = (data, { isUpdate = false } = {}) => {
  const payload = { ...data };

  if (payload.name !== undefined) {
    payload.name = String(payload.name).trim();
  }

  if (payload.client_key !== undefined) {
    payload.client_key = normalizeClientKey(payload.client_key);
    if (payload.client_key && !isSupportedClientKey(payload.client_key)) {
      throw new Error(
        `Invalid client_key. Supported module prefixes: ${SUPPORTED_CLIENT_MODULES.join(", ")}`,
      );
    }
  }

  if (!isUpdate && !payload.client_key) {
    throw new Error("client_key is required");
  }

  return payload;
};

export const listClients = async () => {
  return await db.Client.findAll({ order: [["createdAt", "DESC"]] });
};

export const getClient = async (id) => {
  return await db.Client.findOne({ where: { id } });
};

export const createClient = async (data) => {
  const payload = normalizeClientPayload(data);
  return await db.Client.create(payload);
};

export const updateClient = async (id, data) => {
  const client = await db.Client.findOne({ where: { id } });
  if (!client) throw new Error("Client not found");

  const payload = normalizeClientPayload(data, { isUpdate: true });
  return await client.update(payload);
};

export const deleteClient = async (id) => {
  const deleted = await db.Client.destroy({ where: { id } });
  if (!deleted) throw new Error("Client not found");
  return true;
};
