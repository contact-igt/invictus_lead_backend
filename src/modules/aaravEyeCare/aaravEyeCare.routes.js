import express from "express";
import {
  exportAaravEyeCareLeads,
  getAaravEyeCareLeads,
  getAaravEyeCareSummaryMetrics,
  getAaravEyeCareLead,
  registerAaravEyeCarePublicLead,
  createAaravEyeCareLeadRecord,
  updateAaravEyeCareLeadRecord,
  deleteAaravEyeCareLeadRecord,
} from "./aaravEyeCare.controller.js";
import {
  authenticateToken,
  authorizeManagementRole,
} from "../../middlewares/auth/authMiddlewares.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import {
  validateAaravEyeCareCreate,
  validateAaravEyeCarePublicCreate,
  validateAaravEyeCareUpdate,
  validateAaravEyeCareId,
  validateAaravEyeCareList,
  validateAaravEyeCareExport,
  validateAaravEyeCareContext,
} from "../../middlewares/validation/aaravEyeCareValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("aarav_eye_care"),
  validateAaravEyeCarePublicCreate,
  registerAaravEyeCarePublicLead,
);

router.use(authenticateToken);
router.use(attachTenantContext);

router.get("/summary", validateAaravEyeCareContext, getAaravEyeCareSummaryMetrics);
router.get("/", validateAaravEyeCareList, getAaravEyeCareLeads);
router.get("/export", validateAaravEyeCareExport, exportAaravEyeCareLeads);
router.get(
  "/:id",
  validateAaravEyeCareId,
  validateAaravEyeCareContext,
  getAaravEyeCareLead,
);

router.post(
  "/",
  validateAaravEyeCareContext,
  validateAaravEyeCareCreate,
  createAaravEyeCareLeadRecord,
);
router.patch(
  "/:id",
  validateAaravEyeCareId,
  validateAaravEyeCareContext,
  validateAaravEyeCareUpdate,
  updateAaravEyeCareLeadRecord,
);
router.delete(
  "/:id",
  authorizeManagementRole,
  validateAaravEyeCareId,
  validateAaravEyeCareContext,
  deleteAaravEyeCareLeadRecord,
);

export default router;
