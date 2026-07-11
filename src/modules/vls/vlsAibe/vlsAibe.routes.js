import express from "express";
import {
  registerVlsAibeHandler,
  createVlsAibeAdminHandler,
  updateVlsAibeHandler,
  listVlsAibeHandler,
  getVlsAibeByIdHandler,
  deleteVlsAibeHandler,
} from "./vlsAibe.controller.js";
import { resolvePublicTenant } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../../middlewares/auth/clientContextMiddleware.js";
import { validateVlsAibeRegistration } from "../../../middlewares/validation/vlsAibeValidation.js";

const router = express.Router();

// Public registration (landing page, post-payment)
router.post(
  "/register",
  resolvePublicTenant,
  validateVlsAibeRegistration,
  registerVlsAibeHandler,
);

// Admin CRUD (protected)
router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));
router.get("/", listVlsAibeHandler);
router.get("/:id", getVlsAibeByIdHandler);
router.post(
  "/",
  validateVlsAibeRegistration,
  createVlsAibeAdminHandler,
);
router.patch("/:id", updateVlsAibeHandler);
router.delete("/:id", deleteVlsAibeHandler);

export default router;
