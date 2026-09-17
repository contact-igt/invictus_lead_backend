import express from "express";
import {
  registerVlsContactHandler,
  createVlsContactAdminHandler,
  updateVlsContactHandler,
  getVlsContactHandler,
  getVlsContactByIdHandler,
  deleteVlsContactHandler,
} from "./vlsContact.controller.js";
import { resolvePublicTenantForModule } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../../middlewares/auth/clientContextMiddleware.js";
import { validateVlsContact } from "../../../middlewares/validation/vlsContactValidation.js";

const router = express.Router();

// Public: vls-frontend's /contact page form (X-Client-Key: vls_law).
router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsContact,
  registerVlsContactHandler,
);

// Protected: Admin CRUD
router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));
router.get("/", getVlsContactHandler);
router.get("/:id", getVlsContactByIdHandler);
router.post("/", validateVlsContact, createVlsContactAdminHandler);
router.patch("/:id", updateVlsContactHandler);
router.delete("/:id", deleteVlsContactHandler);

export default router;
