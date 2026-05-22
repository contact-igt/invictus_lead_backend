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
router.get("/", authenticateToken, attachTenantContext, listVlsAibeHandler);
router.get("/:id", authenticateToken, attachTenantContext, getVlsAibeByIdHandler);
router.post(
  "/",
  authenticateToken,
  attachTenantContext,
  validateVlsAibeRegistration,
  createVlsAibeAdminHandler,
);
router.patch("/:id", authenticateToken, attachTenantContext, updateVlsAibeHandler);
router.delete("/:id", authenticateToken, attachTenantContext, deleteVlsAibeHandler);

export default router;
