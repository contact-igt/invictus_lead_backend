import express from "express";
import {
  registerVlsAiForAdvocatesHandler,
  createVlsAiForAdvocatesAdminHandler,
  updateVlsAiForAdvocatesHandler,
  getVlsAiForAdvocatesHandler,
  getVlsAiForAdvocatesByIdHandler,
  deleteVlsAiForAdvocatesHandler,
} from "./vlsAiForAdvocates.controller.js";
import { resolvePublicTenantForModule } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../../middlewares/auth/clientContextMiddleware.js";
import { validateVlsAiForAdvocatesRegistration } from "../../../middlewares/validation/vlsAiForAdvocatesValidation.js";

const router = express.Router();

// Public: Landing page form submission after Razorpay payment
router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsAiForAdvocatesRegistration,
  registerVlsAiForAdvocatesHandler,
);

// Protected: Admin CRUD
router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));
router.get("/", getVlsAiForAdvocatesHandler);
router.get("/:id", getVlsAiForAdvocatesByIdHandler);
router.post("/", validateVlsAiForAdvocatesRegistration, createVlsAiForAdvocatesAdminHandler);
router.patch("/:id", updateVlsAiForAdvocatesHandler);
router.delete("/:id", deleteVlsAiForAdvocatesHandler);

export default router;
