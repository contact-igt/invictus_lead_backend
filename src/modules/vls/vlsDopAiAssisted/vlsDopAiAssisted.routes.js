import express from "express";
import {
  registerVlsDopAiAssistedHandler,
  createVlsDopAiAssistedAdminHandler,
  updateVlsDopAiAssistedHandler,
  getVlsDopAiAssistedHandler,
  getVlsDopAiAssistedByIdHandler,
  deleteVlsDopAiAssistedHandler,
} from "./vlsDopAiAssisted.controller.js";
import { resolvePublicTenantForModule } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../../middlewares/auth/clientContextMiddleware.js";
import { validateVlsDopAiAssistedRegistration } from "../../../middlewares/validation/vlsDopAiAssistedValidation.js";

const router = express.Router();

// ── Public: Landing page form submission ───────────────
router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsDopAiAssistedRegistration,
  registerVlsDopAiAssistedHandler,
);

// ── Protected: Admin CRUD ─────────────────────────────────────────────────────
router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));
router.get("/", getVlsDopAiAssistedHandler);
router.get("/:id", getVlsDopAiAssistedByIdHandler);
router.post("/", validateVlsDopAiAssistedRegistration, createVlsDopAiAssistedAdminHandler);
router.patch("/:id", updateVlsDopAiAssistedHandler);
router.delete("/:id", deleteVlsDopAiAssistedHandler);

export default router;
