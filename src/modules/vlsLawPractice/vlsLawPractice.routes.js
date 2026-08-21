import express from "express";
import {
  createVlsLawPracticeRegistrationRecord,
  deleteVlsLawPracticeRegistrationRecord,
  exportVlsLawPracticeRegistrations,
  getVlsLawPracticeRegistration,
  getVlsLawPracticeRegistrations,
  getVlsLawPracticeSummaryMetrics,
  updateVlsLawPracticeRegistrationRecord,
  registerVlsLawPracticePublicLead,
} from "./vlsLawPractice.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateVlsLawPracticeContext,
  validateVlsLawPracticeCreate,
  validateVlsLawPracticeExport,
  validateVlsLawPracticeId,
  validateVlsLawPracticeList,
  validateVlsLawPracticeUpdate,
  validateVlsLawPracticePublicCreate,
} from "../../middlewares/validation/vlsLawPracticeValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsLawPracticePublicCreate,
  registerVlsLawPracticePublicLead,
);

router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));

router.get("/summary", validateVlsLawPracticeContext, getVlsLawPracticeSummaryMetrics);
router.get("/export", validateVlsLawPracticeExport, exportVlsLawPracticeRegistrations);
router.get("/", validateVlsLawPracticeList, getVlsLawPracticeRegistrations);
router.get(
  "/:id",
  validateVlsLawPracticeId,
  validateVlsLawPracticeContext,
  getVlsLawPracticeRegistration,
);
router.post(
  "/",
  validateVlsLawPracticeContext,
  validateVlsLawPracticeCreate,
  createVlsLawPracticeRegistrationRecord,
);
router.patch(
  "/:id",
  validateVlsLawPracticeId,
  validateVlsLawPracticeContext,
  validateVlsLawPracticeUpdate,
  updateVlsLawPracticeRegistrationRecord,
);
router.delete(
  "/:id",
  validateVlsLawPracticeId,
  validateVlsLawPracticeContext,
  deleteVlsLawPracticeRegistrationRecord,
);

export default router;
