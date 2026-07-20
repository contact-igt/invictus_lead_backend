import db from "../database/index.js";
import { extractClientModuleKey, normalizeClientKey } from "./clientKey.js";

const contextError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const resolveClientId = async ({ tenant, requestedClientKey, expectedModuleKey }) => {
  if (!tenant?.isSuperAdmin) {
    if (!tenant?.id) throw contextError(403, "A valid tenant context is required");

    if (
      expectedModuleKey &&
      extractClientModuleKey(tenant.clientKey) !== expectedModuleKey
    ) {
      throw contextError(404, "Client context not found");
    }

    return tenant.id;
  }
  const clientKey = normalizeClientKey(requestedClientKey);
  if (!clientKey) throw contextError(400, "_client_key is required for super-admin requests");
  if (expectedModuleKey && extractClientModuleKey(clientKey) !== expectedModuleKey) {
    throw contextError(404, "Client context not found");
  }
  const client = await db.Client.findOne({
    where: { client_key: clientKey },
    attributes: ["id", "client_key"],
  });
  if (!client) throw contextError(404, "Client context not found");
  return client.id;
};

export const resolveScopedTenant = async (options) => {
  const clientId = await resolveClientId(options);

  if (!options.tenant?.isSuperAdmin) return options.tenant;

  const requestedClientKey = normalizeClientKey(options.requestedClientKey);
  return Object.assign(
    Object.create(Object.getPrototypeOf(options.tenant)),
    options.tenant,
    {
      id: clientId,
      clientId,
      clientKey: requestedClientKey,
      isSuperAdmin: false,
    },
  );
};
