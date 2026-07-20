import express from "express";
import {
  exportAntardrashtiNetralayaLeads,
  getAntardrashtiNetralayaLeads,
  getAntardrashtiNetralayaSummaryMetrics,
  getAntardrashtiNetralayaLead,
  createAntardrashtiNetralayaLeadRecord,
  updateAntardrashtiNetralayaLeadRecord,
  deleteAntardrashtiNetralayaLeadRecord,
  registerAntardrashtiNetralayaPublicLead,
} from "./antardrashtiNetralaya.controller.js";
import {
  authenticateToken,
  authorizeManagementRole,
} from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateAntardrashtiNetralayaCreate,
  validateAntardrashtiNetralayaUpdate,
  validateAntardrashtiNetralayaId,
  validateAntardrashtiNetralayaList,
  validateAntardrashtiNetralayaExport,
  validateAntardrashtiNetralayaContext,
  validateAntardrashtiNetralayaPublicCreate,
} from "../../middlewares/validation/antardrashtiNetralayaValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenantForModule("antardrashti_netralaya"),
  validateAntardrashtiNetralayaPublicCreate,
  registerAntardrashtiNetralayaPublicLead,
);

router.use(authenticateToken);
router.use(attachTenantContext);

router.get("/summary", validateAntardrashtiNetralayaContext, getAntardrashtiNetralayaSummaryMetrics);
router.get("/export", validateAntardrashtiNetralayaExport, exportAntardrashtiNetralayaLeads);
router.get("/", validateAntardrashtiNetralayaList, getAntardrashtiNetralayaLeads);
router.get(
  "/:id",
  validateAntardrashtiNetralayaId,
  validateAntardrashtiNetralayaContext,
  getAntardrashtiNetralayaLead,
);
router.post(
  "/",
  validateAntardrashtiNetralayaContext,
  validateAntardrashtiNetralayaCreate,
  createAntardrashtiNetralayaLeadRecord,
);
router.patch(
  "/:id",
  validateAntardrashtiNetralayaId,
  validateAntardrashtiNetralayaContext,
  validateAntardrashtiNetralayaUpdate,
  updateAntardrashtiNetralayaLeadRecord,
);
router.delete(
  "/:id",
  authorizeManagementRole,
  validateAntardrashtiNetralayaId,
  validateAntardrashtiNetralayaContext,
  deleteAntardrashtiNetralayaLeadRecord,
);

export default router;





