import express from "express";
import {
  createVlsConsumerProtectionLawMasterClassRegistrationRecord,
  deleteVlsConsumerProtectionLawMasterClassRegistrationRecord,
  exportVlsConsumerProtectionLawMasterClassRegistrations,
  getVlsConsumerProtectionLawMasterClassRegistration,
  getVlsConsumerProtectionLawMasterClassRegistrations,
  getVlsConsumerProtectionLawMasterClassSummaryMetrics,
  registerVlsConsumerProtectionLawMasterClassPublicLead,
  updateVlsConsumerProtectionLawMasterClassRegistrationRecord,
} from "./vlsConsumerProtectionLawMasterClass.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateVlsConsumerProtectionLawMasterClassContext,
  validateVlsConsumerProtectionLawMasterClassCreate,
  validateVlsConsumerProtectionLawMasterClassExport,
  validateVlsConsumerProtectionLawMasterClassId,
  validateVlsConsumerProtectionLawMasterClassList,
  validateVlsConsumerProtectionLawMasterClassPublicCreate,
  validateVlsConsumerProtectionLawMasterClassUpdate,
} from "../../middlewares/validation/vlsConsumerProtectionLawMasterClassValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsConsumerProtectionLawMasterClassPublicCreate,
  registerVlsConsumerProtectionLawMasterClassPublicLead
);

router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));

router.get("/summary", validateVlsConsumerProtectionLawMasterClassContext, getVlsConsumerProtectionLawMasterClassSummaryMetrics);
router.get("/export", validateVlsConsumerProtectionLawMasterClassExport, exportVlsConsumerProtectionLawMasterClassRegistrations);
router.get("/", validateVlsConsumerProtectionLawMasterClassList, getVlsConsumerProtectionLawMasterClassRegistrations);
router.get(
  "/:id",
  validateVlsConsumerProtectionLawMasterClassId,
  validateVlsConsumerProtectionLawMasterClassContext,
  getVlsConsumerProtectionLawMasterClassRegistration
);
router.post(
  "/",
  validateVlsConsumerProtectionLawMasterClassContext,
  validateVlsConsumerProtectionLawMasterClassCreate,
  createVlsConsumerProtectionLawMasterClassRegistrationRecord
);
router.patch(
  "/:id",
  validateVlsConsumerProtectionLawMasterClassId,
  validateVlsConsumerProtectionLawMasterClassContext,
  validateVlsConsumerProtectionLawMasterClassUpdate,
  updateVlsConsumerProtectionLawMasterClassRegistrationRecord
);
router.delete(
  "/:id",
  validateVlsConsumerProtectionLawMasterClassId,
  validateVlsConsumerProtectionLawMasterClassContext,
  deleteVlsConsumerProtectionLawMasterClassRegistrationRecord
);

export default router;
