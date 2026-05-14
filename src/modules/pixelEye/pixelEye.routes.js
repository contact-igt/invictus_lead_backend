import express from "express";
import {
  getLeads,
  exportLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  getNotifications,
  getNotificationsSummary,
} from "./pixelEye.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import {
  validatePixelEyeCreate,
  validatePixelEyeUpdate,
} from "../../middlewares/validation/pixelEyeValidation.js";

const router = express.Router();

router.use(authenticateToken);
router.use(attachTenantContext);

router.get("/", getLeads);
router.get("/export", exportLeads);
router.get("/notifications", getNotifications);
router.get("/notifications/summary", getNotificationsSummary);
router.get("/:id", getLeadById);
router.post("/", validatePixelEyeCreate, createLead);
router.patch("/:id", validatePixelEyeUpdate, updateLead);
router.delete("/:id", deleteLead);

export default router;
