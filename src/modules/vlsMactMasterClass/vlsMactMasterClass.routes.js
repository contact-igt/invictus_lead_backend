import express from "express";
import {
  createVlsMactMasterClassRegistrationRecord,
  deleteVlsMactMasterClassRegistrationRecord,
  exportVlsMactMasterClassRegistrations,
  getVlsMactMasterClassRegistration,
  getVlsMactMasterClassRegistrations,
  getVlsMactMasterClassSummaryMetrics,
  updateVlsMactMasterClassRegistrationRecord,
  registerVlsMactMasterClassPublicLead,
} from "./vlsMactMasterClass.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateVlsMactMasterClassContext,
  validateVlsMactMasterClassCreate,
  validateVlsMactMasterClassExport,
  validateVlsMactMasterClassId,
  validateVlsMactMasterClassList,
  validateVlsMactMasterClassUpdate,
  validateVlsMactMasterClassPublicCreate,
} from "../../middlewares/validation/vlsMactMasterClassValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsMactMasterClassPublicCreate,
  registerVlsMactMasterClassPublicLead,
);

router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));

router.get("/summary", validateVlsMactMasterClassContext, getVlsMactMasterClassSummaryMetrics);
router.get("/export", validateVlsMactMasterClassExport, exportVlsMactMasterClassRegistrations);
router.get("/", validateVlsMactMasterClassList, getVlsMactMasterClassRegistrations);
router.get(
  "/:id",
  validateVlsMactMasterClassId,
  validateVlsMactMasterClassContext,
  getVlsMactMasterClassRegistration,
);
router.post(
  "/",
  validateVlsMactMasterClassContext,
  validateVlsMactMasterClassCreate,
  createVlsMactMasterClassRegistrationRecord,
);
router.patch(
  "/:id",
  validateVlsMactMasterClassId,
  validateVlsMactMasterClassContext,
  validateVlsMactMasterClassUpdate,
  updateVlsMactMasterClassRegistrationRecord,
);
router.delete(
  "/:id",
  validateVlsMactMasterClassId,
  validateVlsMactMasterClassContext,
  deleteVlsMactMasterClassRegistrationRecord,
);

export default router;
