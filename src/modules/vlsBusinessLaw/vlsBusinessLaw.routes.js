import express from "express";
import {
  createVlsBusinessLawRegistrationRecord,
  deleteVlsBusinessLawRegistrationRecord,
  exportVlsBusinessLawRegistrations,
  getVlsBusinessLawRegistration,
  getVlsBusinessLawRegistrations,
  getVlsBusinessLawSummaryMetrics,
  updateVlsBusinessLawRegistrationRecord,
  registerVlsBusinessLawPublicLead,
} from "./vlsBusinessLaw.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateVlsBusinessLawContext,
  validateVlsBusinessLawCreate,
  validateVlsBusinessLawExport,
  validateVlsBusinessLawId,
  validateVlsBusinessLawList,
  validateVlsBusinessLawUpdate,
  validateVlsBusinessLawPublicCreate,
} from "../../middlewares/validation/vlsBusinessLawValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsBusinessLawPublicCreate,
  registerVlsBusinessLawPublicLead,
);

router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));

router.get("/summary", validateVlsBusinessLawContext, getVlsBusinessLawSummaryMetrics);
router.get("/export", validateVlsBusinessLawExport, exportVlsBusinessLawRegistrations);
router.get("/", validateVlsBusinessLawList, getVlsBusinessLawRegistrations);
router.get(
  "/:id",
  validateVlsBusinessLawId,
  validateVlsBusinessLawContext,
  getVlsBusinessLawRegistration,
);
router.post(
  "/",
  validateVlsBusinessLawContext,
  validateVlsBusinessLawCreate,
  createVlsBusinessLawRegistrationRecord,
);
router.patch(
  "/:id",
  validateVlsBusinessLawId,
  validateVlsBusinessLawContext,
  validateVlsBusinessLawUpdate,
  updateVlsBusinessLawRegistrationRecord,
);
router.delete(
  "/:id",
  validateVlsBusinessLawId,
  validateVlsBusinessLawContext,
  deleteVlsBusinessLawRegistrationRecord,
);

export default router;
