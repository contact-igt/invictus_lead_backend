import express from "express";
import {
  registerFamilyLawHandler,
  createFamilyLawAdminHandler,
  updateFamilyLawHandler,
  getFamilyLawHandler,
  getFamilyLawByIdHandler,
  deleteFamilyLawHandler,
} from "./familyLaw.controller.js";
import { resolvePublicTenant } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { validateFamilyLawRegistration } from "../../../middlewares/validation/familyLawValidation.js";

const router = express.Router();

// Public: Landing page form submission after Razorpay payment
router.post(
  "/register",
  resolvePublicTenant,
  validateFamilyLawRegistration,
  registerFamilyLawHandler,
);

// Protected: Admin CRUD
router.get("/", authenticateToken, attachTenantContext, getFamilyLawHandler);
router.get("/:id", authenticateToken, attachTenantContext, getFamilyLawByIdHandler);
router.post("/", authenticateToken, attachTenantContext, validateFamilyLawRegistration, createFamilyLawAdminHandler);
router.patch("/:id", authenticateToken, attachTenantContext, updateFamilyLawHandler);
router.delete("/:id", authenticateToken, attachTenantContext, deleteFamilyLawHandler);

export default router;
