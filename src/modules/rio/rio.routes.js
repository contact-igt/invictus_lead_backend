import express from "express";
import {
  exportRioLeads,
  getRioLeads,
  getRioSummaryMetrics,
  getRioLead,
  createRioLeadRecord,
  updateRioLeadRecord,
  deleteRioLeadRecord,
  registerRioPublicLead,
} from "./rio.controller.js";
import {
  authenticateToken,
  authorizeManagementRole,
} from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { resolvePublicTenant } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateRioCreate,
  validateRioUpdate,
  validateRioId,
  validateRioList,
  validateRioExport,
  validateRioContext,
  validateRioPublicCreate,
} from "../../middlewares/validation/rioValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenant,
  validateRioPublicCreate,
  registerRioPublicLead,
);

router.use(authenticateToken);
router.use(attachTenantContext);

router.get("/summary", validateRioContext, getRioSummaryMetrics);
router.get("/export", validateRioExport, exportRioLeads);
router.get("/", validateRioList, getRioLeads);
router.get(
  "/:id",
  validateRioId,
  validateRioContext,
  getRioLead,
);
router.post(
  "/",
  validateRioContext,
  validateRioCreate,
  createRioLeadRecord,
);
router.patch(
  "/:id",
  validateRioId,
  validateRioContext,
  validateRioUpdate,
  updateRioLeadRecord,
);
router.delete(
  "/:id",
  authorizeManagementRole,
  validateRioId,
  validateRioContext,
  deleteRioLeadRecord,
);

export default router;





