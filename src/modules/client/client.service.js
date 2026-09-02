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
  const client = await db.Client.findOne({ where: { id } });
  if (!client) throw new Error("Client not found");

  // Every tenant-scoped table (leads, doctors, appointments, CRM config, sheet
  // enquiries, …) has a `client_id` FK to `clients.id`, so a bare delete fails
  // for any client that has data. Remove those rows first, in one transaction.
  const scopedModels = Object.values(db).filter(
    (model) =>
      model &&
      typeof model.destroy === "function" &&
      model !== db.Client &&
      model.rawAttributes &&
      model.rawAttributes.client_id,
  );

  await db.sequelize.transaction(async (transaction) => {
    // Child tables can reference each other (e.g. appointments -> leads), so
    // drop FK enforcement for the span of the cleanup rather than solving the
    // deletion order.
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 0", { transaction });
    try {
      for (const model of scopedModels) {
        // eslint-disable-next-line no-await-in-loop
        await model.destroy({ where: { client_id: id }, transaction, force: true });
      }
      await db.Client.destroy({ where: { id }, transaction });
    } finally {
      await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 1", { transaction });
    }
  });

  return true;
};
