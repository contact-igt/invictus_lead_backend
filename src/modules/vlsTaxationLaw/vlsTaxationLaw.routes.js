import express from "express";
import {
  createVlsTaxationLawRegistrationRecord,
  deleteVlsTaxationLawRegistrationRecord,
  exportVlsTaxationLawRegistrations,
  getVlsTaxationLawRegistration,
  getVlsTaxationLawRegistrations,
  getVlsTaxationLawSummaryMetrics,
  updateVlsTaxationLawRegistrationRecord,
  registerVlsTaxationLawPublicLead,
} from "./vlsTaxationLaw.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateVlsTaxationLawContext,
  validateVlsTaxationLawCreate,
  validateVlsTaxationLawExport,
  validateVlsTaxationLawId,
  validateVlsTaxationLawList,
  validateVlsTaxationLawUpdate,
  validateVlsTaxationLawPublicCreate,
} from "../../middlewares/validation/vlsTaxationLawValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsTaxationLawPublicCreate,
  registerVlsTaxationLawPublicLead,
);

router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));

router.get("/summary", validateVlsTaxationLawContext, getVlsTaxationLawSummaryMetrics);
router.get("/export", validateVlsTaxationLawExport, exportVlsTaxationLawRegistrations);
router.get("/", validateVlsTaxationLawList, getVlsTaxationLawRegistrations);
router.get(
  "/:id",
  validateVlsTaxationLawId,
  validateVlsTaxationLawContext,
  getVlsTaxationLawRegistration,
);
router.post(
  "/",
  validateVlsTaxationLawContext,
  validateVlsTaxationLawCreate,
  createVlsTaxationLawRegistrationRecord,
);
router.patch(
  "/:id",
  validateVlsTaxationLawId,
  validateVlsTaxationLawContext,
  validateVlsTaxationLawUpdate,
  updateVlsTaxationLawRegistrationRecord,
);
router.delete(
  "/:id",
  validateVlsTaxationLawId,
  validateVlsTaxationLawContext,
  deleteVlsTaxationLawRegistrationRecord,
);

export default router;
