import express from "express";
import {
  registerFamilyLawHandler,
  createFamilyLawAdminHandler,
  updateFamilyLawHandler,
  getFamilyLawHandler,
  getFamilyLawByIdHandler,
  deleteFamilyLawHandler,
} from "./familyLaw.controller.js";
import { resolvePublicTenantForModule } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../../middlewares/auth/clientContextMiddleware.js";
import { validateFamilyLawRegistration } from "../../../middlewares/validation/familyLawValidation.js";

const router = express.Router();

// Public: Landing page form submission after Razorpay payment
router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateFamilyLawRegistration,
  registerFamilyLawHandler,
);

// Protected: Admin CRUD
router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));
router.get("/", getFamilyLawHandler);
router.get("/:id", getFamilyLawByIdHandler);
router.post("/", validateFamilyLawRegistration, createFamilyLawAdminHandler);
router.patch("/:id", updateFamilyLawHandler);
router.delete("/:id", deleteFamilyLawHandler);

export default router;
