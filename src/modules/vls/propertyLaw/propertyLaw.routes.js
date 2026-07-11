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
import { scopeSuperAdminToClient } from "../../../middlewares/auth/clientContextMiddleware.js";
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
router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));
router.get("/", getPropertyLawHandler);
router.get("/:id", getPropertyLawByIdHandler);
router.post("/", validatePropertyLawRegistration, createPropertyLawAdminHandler);
router.patch("/:id", updatePropertyLawHandler);
router.delete("/:id", deletePropertyLawHandler);

export default router;
