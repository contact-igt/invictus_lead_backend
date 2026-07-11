import bcrypt from "bcrypt";
import db from "../../database/index.js";
import { tenantSafe } from "../../utils/tenantContext.js";
import { normalizeClientKey } from "../../utils/clientKey.js";

const userAttributes = {
  exclude: ["password"],
};

const includeClient = [
  {
    model: db.Client,
    as: "client",
    attributes: ["id", "name", "client_key"],
  },
];

const resolveClientIdFromKey = async (clientKeyRaw) => {
  const clientKey = normalizeClientKey(clientKeyRaw);
  if (!clientKey) return null;

  const client = await db.Client.findOne({ where: { client_key: clientKey } });
  return client ? client.id : null;
};

const sanitizeUserPayload = (data) => {
  const payload = { ...data };
  if (payload.email !== undefined)
    payload.email = String(payload.email).trim().toLowerCase();
  if (payload.username !== undefined)
    payload.username = String(payload.username).trim();
  if (payload.mobile !== undefined)
    payload.mobile = String(payload.mobile).trim();
  return payload;
};

export const listUsers = async (tenant) => {
  const safeModel = tenantSafe(db.Management, tenant);
  return await safeModel.findAll({
    attributes: userAttributes,
    include: includeClient,
    order: [["createdAt", "DESC"]],
  });
};

export const getUserById = async (id, tenant) => {
  const safeModel = tenantSafe(db.Management, tenant);
  return await safeModel.findOne({
    where: { id },
    attributes: userAttributes,
    include: includeClient,
  });
};

export const createUser = async (data, tenant) => {
  const payload = sanitizeUserPayload(data);

  if (!tenant.isSuperAdmin && payload.role === "super-admin") {
    throw new Error("Unauthorized role assignment");
  }

  let clientId = null;

  if (tenant.isSuperAdmin) {
    if (payload.role !== "super-admin" && !payload.client_key) {
      throw new Error("client_key is required for admin/client users");
    }
    if (payload.role !== "super-admin" && payload.client_key) {
      clientId = await resolveClientIdFromKey(payload.client_key);
      if (!clientId) {
        throw new Error("Invalid client_key");
      }
    }
  } else {
    clientId = tenant.id;
  }

  if (!tenant.isSuperAdmin && !clientId) {
    throw new Error("Could not determine client context");
  }

  const exists = await db.Management.findOne({
    where: { email: payload.email },
  });
  if (exists) {
    throw new Error("Email already in use");
  }

  const hashedPassword = await bcrypt.hash(payload.password, 10);

  const created = await db.Management.create({
    title: payload.title,
    username: payload.username,
    email: payload.email,
    country_code: payload.country_code || null,
    mobile: payload.mobile,
    profile_picture: payload.profile_picture || null,
    password: hashedPassword,
    role: payload.role,
    client_id: clientId,
  });

  return await db.Management.findOne({
    where: { id: created.id },
    attributes: userAttributes,
    include: includeClient,
  });
};

export const updateUser = async (id, data, tenant) => {
  const payload = sanitizeUserPayload(data);
  const safeModel = tenantSafe(db.Management, tenant);

  const user = await safeModel.findOne({ where: { id } });
  if (!user) {
    throw new Error("User not found");
  }

  if (!tenant.isSuperAdmin && payload.role === "super-admin") {
    throw new Error("Unauthorized role assignment");
  }

  if (payload.client_key && tenant.isSuperAdmin) {
    const clientId = await resolveClientIdFromKey(payload.client_key);
    if (!clientId) {
      throw new Error("Invalid client_key");
    }
    payload.client_id = clientId;
  }

  if (!tenant.isSuperAdmin) {
    delete payload.client_id;
    delete payload.client_key;
  }

  if (payload.password) {
    payload.password = await bcrypt.hash(payload.password, 10);
  }

  await user.update(payload);

  return await db.Management.findOne({
    where: { id: user.id },
    attributes: userAttributes,
    include: includeClient,
  });
};

export const deleteUser = async (id, tenant) => {
  const safeModel = tenantSafe(db.Management, tenant);
  const deleted = await safeModel.destroy({ where: { id } });
  if (!deleted) {
    throw new Error("User not found");
  }
  return true;
};


