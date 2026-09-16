import express from "express";
import {
  getVaccineChartLeads,
  getVaccineChartLead,
  createVaccineChartLeadRecord,
  updateVaccineChartLeadRecord,
  deleteVaccineChartLeadRecord,
  registerVaccineChartPublicLead,
} from "./rioVaccineChart.controller.js";
import {
  authenticateToken,
  authorizeManagementRole,
} from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import {
  validateRioVaccineChartCreate,
  validateRioVaccineChartUpdate,
  validateRioVaccineChartId,
  validateRioVaccineChartList,
  validateRioVaccineChartPublicCreate,
} from "../../middlewares/validation/rioVaccineChartValidation.js";

const router = express.Router();

// Public: called from the Rio website's Book Vaccine form (X-Client-Key: rio).
router.post(
  "/register",
  resolvePublicTenantForModule("rio"),
  validateRioVaccineChartPublicCreate,
  registerVaccineChartPublicLead,
);

router.use(authenticateToken);
router.use(attachTenantContext);

router.get("/", validateRioVaccineChartList, getVaccineChartLeads);
router.get("/:id", validateRioVaccineChartId, getVaccineChartLead);
router.post("/", validateRioVaccineChartCreate, createVaccineChartLeadRecord);
router.patch(
  "/:id",
  validateRioVaccineChartId,
  validateRioVaccineChartUpdate,
  updateVaccineChartLeadRecord,
);
router.delete(
  "/:id",
  authorizeManagementRole,
  validateRioVaccineChartId,
  deleteVaccineChartLeadRecord,
);

export default router;
