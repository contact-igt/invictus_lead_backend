import express from "express";
import {
  createVlsEconomicLawsRegistrationRecord,
  deleteVlsEconomicLawsRegistrationRecord,
  exportVlsEconomicLawsRegistrations,
  getVlsEconomicLawsRegistration,
  getVlsEconomicLawsRegistrations,
  getVlsEconomicLawsSummaryMetrics,
  updateVlsEconomicLawsRegistrationRecord,
  registerVlsEconomicLawsPublicLead,
} from "./vlsEconomicLaws.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateVlsEconomicLawsContext,
  validateVlsEconomicLawsCreate,
  validateVlsEconomicLawsExport,
  validateVlsEconomicLawsId,
  validateVlsEconomicLawsList,
  validateVlsEconomicLawsUpdate,
  validateVlsEconomicLawsPublicCreate,
} from "../../middlewares/validation/vlsEconomicLawsValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsEconomicLawsPublicCreate,
  registerVlsEconomicLawsPublicLead,
);

router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));

router.get("/summary", validateVlsEconomicLawsContext, getVlsEconomicLawsSummaryMetrics);
router.get("/export", validateVlsEconomicLawsExport, exportVlsEconomicLawsRegistrations);
router.get("/", validateVlsEconomicLawsList, getVlsEconomicLawsRegistrations);
router.get(
  "/:id",
  validateVlsEconomicLawsId,
  validateVlsEconomicLawsContext,
  getVlsEconomicLawsRegistration,
);
router.post(
  "/",
  validateVlsEconomicLawsContext,
  validateVlsEconomicLawsCreate,
  createVlsEconomicLawsRegistrationRecord,
);
router.patch(
  "/:id",
  validateVlsEconomicLawsId,
  validateVlsEconomicLawsContext,
  validateVlsEconomicLawsUpdate,
  updateVlsEconomicLawsRegistrationRecord,
);
router.delete(
  "/:id",
  validateVlsEconomicLawsId,
  validateVlsEconomicLawsContext,
  deleteVlsEconomicLawsRegistrationRecord,
);

export default router;
