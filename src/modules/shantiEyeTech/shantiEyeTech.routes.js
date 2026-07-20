import express from "express";
import {
  exportShantiEyeTechLeads,
  getShantiEyeTechLeads,
  getShantiEyeTechSummaryMetrics,
  getShantiEyeTechLead,
  registerShantiEyeTechPublicLead,
  createShantiEyeTechLeadRecord,
  updateShantiEyeTechLeadRecord,
  deleteShantiEyeTechLeadRecord,
} from "./shantiEyeTech.controller.js";
import {
  authenticateToken,
  authorizeManagementRole,
} from "../../middlewares/auth/authMiddlewares.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import {
  validateShantiEyeTechCreate,
  validateShantiEyeTechPublicCreate,
  validateShantiEyeTechUpdate,
  validateShantiEyeTechId,
  validateShantiEyeTechList,
  validateShantiEyeTechExport,
  validateShantiEyeTechContext,
} from "../../middlewares/validation/shantiEyeTechValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("shanti_eye_tech"),
  validateShantiEyeTechPublicCreate,
  registerShantiEyeTechPublicLead,
);

router.use(authenticateToken);
router.use(attachTenantContext);

router.get(
  "/summary",
  validateShantiEyeTechContext,
  getShantiEyeTechSummaryMetrics,
);
router.get("/export", validateShantiEyeTechExport, exportShantiEyeTechLeads);
router.get("/", validateShantiEyeTechList, getShantiEyeTechLeads);
router.get(
  "/:id",
  validateShantiEyeTechId,
  validateShantiEyeTechContext,
  getShantiEyeTechLead,
);
router.post(
  "/",
  validateShantiEyeTechContext,
  validateShantiEyeTechCreate,
  createShantiEyeTechLeadRecord,
);
router.patch(
  "/:id",
  validateShantiEyeTechId,
  validateShantiEyeTechContext,
  validateShantiEyeTechUpdate,
  updateShantiEyeTechLeadRecord,
);
router.delete(
  "/:id",
  authorizeManagementRole,
  validateShantiEyeTechId,
  validateShantiEyeTechContext,
  deleteShantiEyeTechLeadRecord,
);

export default router;
