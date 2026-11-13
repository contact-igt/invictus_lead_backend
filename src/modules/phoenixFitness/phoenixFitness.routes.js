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

import { phoenixWebsiteSchema } from "./phoenixFitnessWebsite.validation.js";
import { createPhoenixFitnessWebsiteLead } from "./phoenixFitnessWebsite.service.js";

const router = express.Router();
router.post("/website/register", resolvePublicTenantForModule("phoenix_fitness"), async (req, res, next) => {
  const { error, value } = phoenixWebsiteSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ success: false, message: "Invalid website enquiry", details: error.details.map((item) => item.message) });
  try {
    const result = await createPhoenixFitnessWebsiteLead(value, req.publicTenantId);
    return res.status(result.duplicate ? 200 : 201).json({ success: true, ...result });
  } catch (error) { return next(error); }
});

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
