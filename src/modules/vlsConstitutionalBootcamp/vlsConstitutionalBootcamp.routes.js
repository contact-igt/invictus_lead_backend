import express from "express";
import {
  createVlsConstitutionalBootcampRegistrationRecord,
  deleteVlsConstitutionalBootcampRegistrationRecord,
  exportVlsConstitutionalBootcampRegistrations,
  getVlsConstitutionalBootcampRegistration,
  getVlsConstitutionalBootcampRegistrations,
  getVlsConstitutionalBootcampSummaryMetrics,
  updateVlsConstitutionalBootcampRegistrationRecord,
  registerVlsConstitutionalBootcampPublicLead,
} from "./vlsConstitutionalBootcamp.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateVlsConstitutionalBootcampContext,
  validateVlsConstitutionalBootcampCreate,
  validateVlsConstitutionalBootcampExport,
  validateVlsConstitutionalBootcampId,
  validateVlsConstitutionalBootcampList,
  validateVlsConstitutionalBootcampUpdate,
  validateVlsConstitutionalBootcampPublicCreate,
} from "../../middlewares/validation/vlsConstitutionalBootcampValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsConstitutionalBootcampPublicCreate,
  registerVlsConstitutionalBootcampPublicLead,
);

router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));

router.get("/summary", validateVlsConstitutionalBootcampContext, getVlsConstitutionalBootcampSummaryMetrics);
router.get("/export", validateVlsConstitutionalBootcampExport, exportVlsConstitutionalBootcampRegistrations);
router.get("/", validateVlsConstitutionalBootcampList, getVlsConstitutionalBootcampRegistrations);
router.get(
  "/:id",
  validateVlsConstitutionalBootcampId,
  validateVlsConstitutionalBootcampContext,
  getVlsConstitutionalBootcampRegistration,
);
router.post(
  "/",
  validateVlsConstitutionalBootcampContext,
  validateVlsConstitutionalBootcampCreate,
  createVlsConstitutionalBootcampRegistrationRecord,
);
router.patch(
  "/:id",
  validateVlsConstitutionalBootcampId,
  validateVlsConstitutionalBootcampContext,
  validateVlsConstitutionalBootcampUpdate,
  updateVlsConstitutionalBootcampRegistrationRecord,
);
router.delete(
  "/:id",
  validateVlsConstitutionalBootcampId,
  validateVlsConstitutionalBootcampContext,
  deleteVlsConstitutionalBootcampRegistrationRecord,
);

export default router;
