import { Sequelize } from "sequelize";
import db from "../../database/index.js";
import {
  extractClientModuleKey,
  normalizeClientKey,
} from "../../utils/clientKey.js";

/**
 * Middleware to resolve a tenant (client_id) from a public client_key.
 * Expects 'X-Client-Key' header or 'client_key' in body.
 */
const resolvePublicTenantRequest = (expectedModuleKey) => async (req, res, next) => {
  // BW-SVC-002: `req.body` is undefined on a request with no parsed body — a GET
  // never matches express.json(), so reading `req.body.client_key` threw and the
  // caller got a 500 instead of the intended 401. This middleware only guarded
  // POST intake routes until GET /birthwave-public/services was added.
  const clientKeyRaw = req.headers["x-client-key"] || req.body?.client_key;

  if (!clientKeyRaw) {
    return res.status(401).json({ 
      message: "Authentication failed: Missing Client Key. Please provide 'X-Client-Key' header." 
    });
  }

  const normalizedKey = normalizeClientKey(clientKeyRaw);

  if (
    expectedModuleKey &&
    extractClientModuleKey(normalizedKey) !== expectedModuleKey
  ) {
    return res.status(401).json({ message: "Invalid Client Key" });
  }
  
  try {
    // Case-insensitive match: client_key values are stored in mixed case
    // (e.g. "Rio", "Phoenix_fitness") while normalizedKey is always
    // lowercased above, and the DB column collation isn't reliably
    // case-insensitive for every deployment.
    const client = await db.Client.findOne({
      where: Sequelize.where(
        Sequelize.fn("LOWER", Sequelize.col("client_key")),
        normalizedKey,
      ),
      attributes: ["id", "name"]
    });

    if (!client) {
      return res.status(401).json({ message: "Invalid Client Key" });
    }

    // Attach tenant info to request
    req.publicTenantId = client.id;
    next();
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error during tenant resolution" });
  }
};

// Backward-compatible generic resolver. New public module routes should use
// resolvePublicTenantForModule so a valid key cannot be used across modules.
export const resolvePublicTenant = resolvePublicTenantRequest();

export const resolvePublicTenantForModule = (expectedModuleKey) =>
  resolvePublicTenantRequest(expectedModuleKey);
