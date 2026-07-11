import express from "express";
import {
  createPixelEyeWebsiteLeadRecord,
  deletePixelEyeWebsiteLeadRecord,
  exportPixelEyeWebsiteLeads,
  getPixelEyeWebsiteLead,
  getPixelEyeWebsiteLeadSummaryMetrics,
  getPixelEyeWebsiteLeads,
  updatePixelEyeWebsiteLeadRecord,
  registerPixelEyeWebsitePublicLead,
} from "./pixelEyeWebsiteLead.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { resolvePublicTenant } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validatePixelEyeWebsiteLeadContext,
  validatePixelEyeWebsiteLeadCreate,
  validatePixelEyeWebsiteLeadExport,
  validatePixelEyeWebsiteLeadId,
  validatePixelEyeWebsiteLeadList,
  validatePixelEyeWebsiteLeadUpdate,
  validatePixelEyeWebsiteLeadPublicCreate,
} from "../../middlewares/validation/pixelEyeWebsiteLeadValidation.js";

const router = express.Router();

router.post(
  "/register",
  resolvePublicTenant,
  validatePixelEyeWebsiteLeadPublicCreate,
  registerPixelEyeWebsitePublicLead,
);

router.use(authenticateToken);
router.use(attachTenantContext);

router.get("/summary", validatePixelEyeWebsiteLeadContext, getPixelEyeWebsiteLeadSummaryMetrics);
router.get("/export", validatePixelEyeWebsiteLeadExport, exportPixelEyeWebsiteLeads);
router.get("/", validatePixelEyeWebsiteLeadList, getPixelEyeWebsiteLeads);
router.get(
  "/:id",
  validatePixelEyeWebsiteLeadId,
  validatePixelEyeWebsiteLeadContext,
  getPixelEyeWebsiteLead,
);
router.post(
  "/",
  validatePixelEyeWebsiteLeadContext,
  validatePixelEyeWebsiteLeadCreate,
  createPixelEyeWebsiteLeadRecord,
);
router.patch(
  "/:id",
  validatePixelEyeWebsiteLeadId,
  validatePixelEyeWebsiteLeadContext,
  validatePixelEyeWebsiteLeadUpdate,
  updatePixelEyeWebsiteLeadRecord,
);
router.delete(
  "/:id",
  validatePixelEyeWebsiteLeadId,
  validatePixelEyeWebsiteLeadContext,
  deletePixelEyeWebsiteLeadRecord,
);

export default router;
