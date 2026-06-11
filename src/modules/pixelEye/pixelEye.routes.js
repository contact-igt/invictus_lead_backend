import express from "express";
import {
  getLeads,
  exportLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  markLeadFollowUpHandled,
  rescheduleLeadFollowUp,
  cancelLeadFollowUp,
  getNotifications,
  getNotificationsSummary,
  getLeadFollowUpHistory,
  getFollowUpCallCompliance,
  getMissedFollowUpCalls,
  getFollowUpCallComplianceSummary,
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
router.get("/follow-ups/call-compliance", getFollowUpCallCompliance);
router.get("/follow-ups/missed-calls", getMissedFollowUpCalls);
router.get("/follow-ups/call-compliance-summary", getFollowUpCallComplianceSummary);
router.get("/:id/follow-up/history", getLeadFollowUpHistory);
router.patch("/:id/follow-up/handled", markLeadFollowUpHandled);
router.patch("/:id/follow-up/reschedule", rescheduleLeadFollowUp);
router.patch("/:id/follow-up/cancel", cancelLeadFollowUp);
router.get("/:id", getLeadById);
router.post("/", validatePixelEyeCreate, createLead);
router.patch("/:id", validatePixelEyeUpdate, updateLead);
router.delete("/:id", deleteLead);

export default router;
