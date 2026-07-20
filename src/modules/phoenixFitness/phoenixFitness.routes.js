import express from "express";
import {
  exportPhoenixFitnessLeads,
  getPhoenixFitnessLeads,
  getPhoenixFitnessSummaryMetrics,
  getPhoenixFitnessLead,
  registerPhoenixFitnessPublicLead,
  createPhoenixFitnessLeadRecord,
  updatePhoenixFitnessLeadRecord,
  deletePhoenixFitnessLeadRecord,
} from "./phoenixFitness.controller.js";
import {
  authenticateToken,
  authorizeManagementRole,
} from "../../middlewares/auth/authMiddlewares.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import {
  validatePhoenixFitnessCreate,
  validatePhoenixFitnessPublicCreate,
  validatePhoenixFitnessUpdate,
  validatePhoenixFitnessId,
  validatePhoenixFitnessList,
  validatePhoenixFitnessExport,
  validatePhoenixFitnessContext,
} from "../../middlewares/validation/phoenixFitnessValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("phoenix_fitness"),
  validatePhoenixFitnessPublicCreate,
  registerPhoenixFitnessPublicLead,
);

router.use(authenticateToken);
router.use(attachTenantContext);

router.get(
  "/summary",
  validatePhoenixFitnessContext,
  getPhoenixFitnessSummaryMetrics,
);
router.get("/export", validatePhoenixFitnessExport, exportPhoenixFitnessLeads);
router.get("/", validatePhoenixFitnessList, getPhoenixFitnessLeads);
router.get(
  "/:id",
  validatePhoenixFitnessId,
  validatePhoenixFitnessContext,
  getPhoenixFitnessLead,
);
router.post(
  "/",
  validatePhoenixFitnessContext,
  validatePhoenixFitnessCreate,
  createPhoenixFitnessLeadRecord,
);
router.patch(
  "/:id",
  validatePhoenixFitnessId,
  validatePhoenixFitnessContext,
  validatePhoenixFitnessUpdate,
  updatePhoenixFitnessLeadRecord,
);
router.delete(
  "/:id",
  authorizeManagementRole,
  validatePhoenixFitnessId,
  validatePhoenixFitnessContext,
  deletePhoenixFitnessLeadRecord,
);

export default router;
