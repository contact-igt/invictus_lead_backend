import express from "express";
import {
  registerPropertyLawHandler,
  createPropertyLawAdminHandler,
  updatePropertyLawHandler,
  getPropertyLawHandler,
  getPropertyLawByIdHandler,
  deletePropertyLawHandler,
} from "./propertyLaw.controller.js";
import { resolvePublicTenant } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { validatePropertyLawRegistration } from "../../../middlewares/validation/propertyLawValidation.js";

const router = express.Router();

// ── Public: Landing page form submission after Razorpay payment ───────────────
router.post(
  "/register",
  resolvePublicTenant,
  validatePropertyLawRegistration,
  registerPropertyLawHandler,
);

// ── Protected: Admin CRUD ─────────────────────────────────────────────────────
router.get("/", authenticateToken, attachTenantContext, getPropertyLawHandler);
router.get("/:id", authenticateToken, attachTenantContext, getPropertyLawByIdHandler);
router.post("/", authenticateToken, attachTenantContext, validatePropertyLawRegistration, createPropertyLawAdminHandler);
router.patch("/:id", authenticateToken, attachTenantContext, updatePropertyLawHandler);
router.delete("/:id", authenticateToken, attachTenantContext, deletePropertyLawHandler);

export default router;
