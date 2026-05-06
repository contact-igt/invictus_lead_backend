import { TenantContext } from "../../utils/tenantContext.js";

/**
 * Middleware to attach a TenantContext instance to the request.
 * This should be placed after authenticateToken.
 */
export const attachTenantContext = (req, res, next) => {
  if (!req.user) {
    return res.status(500).json({ message: "Internal Server Error: User context missing" });
  }

  req.tenant = new TenantContext(req.user);
  next();
};
