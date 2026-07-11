import { resolveScopedTenant } from "../../utils/resolveClientContext.js";

export const scopeSuperAdminToClient = (expectedModuleKey) =>
  async (req, res, next) => {
    try {
      req.tenant = await resolveScopedTenant({
        tenant: req.tenant,
        requestedClientKey:
          req.query?._client_key ||
          req.body?._client_key ||
          req.query?.client_key ||
          req.body?.client_key,
        expectedModuleKey,
      });
      next();
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message });
    }
  };
