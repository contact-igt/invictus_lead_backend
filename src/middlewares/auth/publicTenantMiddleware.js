import db from "../../database/index.js";
import { normalizeClientKey } from "../../utils/clientKey.js";

/**
 * Middleware to resolve a tenant (client_id) from a public client_key.
 * Expects 'X-Client-Key' header or 'client_key' in body.
 */
export const resolvePublicTenant = async (req, res, next) => {
  const clientKeyRaw = req.headers["x-client-key"] || req.body.client_key;

  if (!clientKeyRaw) {
    return res.status(401).json({ 
      message: "Authentication failed: Missing Client Key. Please provide 'X-Client-Key' header." 
    });
  }

  const normalizedKey = normalizeClientKey(clientKeyRaw);
  
  try {
    const client = await db.Client.findOne({
      where: { client_key: normalizedKey },
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
