import express from "express";
import {
  getFieldsHandler,
  createFieldHandler,
  updateFieldHandler,
  archiveFieldHandler,
  reorderFieldsHandler,
  getCallsHandler,
  ingestCallHandler,
  getIntegrationsHandler,
  updateIntegrationHandler,
  getMappingsHandler,
  saveMappingsHandler,
} from "./crm.controller.js";
import { authenticateToken, authorizeManagementRole } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import {
  validateCrmId,
  validateCrmProviderParam,
  validateCrmCallProviderParam,
  validateCrmFieldsQuery,
  validateCrmFieldCreate,
  validateCrmFieldUpdate,
  validateCrmReorder,
  validateCrmCallsQuery,
  validateCrmCallIngest,
  validateCrmIntegrationUpdate,
  validateCrmMappingsQuery,
  validateCrmSaveMappings,
} from "../../middlewares/validation/crmValidation.js";

const router = express.Router();

router.use(authenticateToken);
router.use(attachTenantContext);
router.use(scopeSuperAdminToClient("birthwave"));

// Custom fields
router.get("/fields", validateCrmFieldsQuery, getFieldsHandler);
router.post("/fields", authorizeManagementRole, validateCrmFieldCreate, createFieldHandler);
router.post("/fields/reorder", authorizeManagementRole, validateCrmReorder, reorderFieldsHandler);
router.post("/fields/:id/archive", authorizeManagementRole, validateCrmId, archiveFieldHandler);
router.patch("/fields/:id", authorizeManagementRole, validateCrmId, validateCrmFieldUpdate, updateFieldHandler);

// Calls
router.get("/calls", validateCrmCallsQuery, getCallsHandler);
router.post("/calls/ingest/:provider", validateCrmCallProviderParam, validateCrmCallIngest, ingestCallHandler);

// Integrations
router.get("/integrations", getIntegrationsHandler);
router.patch("/integrations/:provider", authorizeManagementRole, validateCrmProviderParam, validateCrmIntegrationUpdate, updateIntegrationHandler);

// Field mappings
router.get("/mappings", validateCrmMappingsQuery, getMappingsHandler);
router.put("/mappings", authorizeManagementRole, validateCrmSaveMappings, saveMappingsHandler);

export default router;
