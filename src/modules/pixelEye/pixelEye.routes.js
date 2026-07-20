import express from "express";
import {
  getLeads,
  exportLeads,
  getLeadById,
  createLead,
  updateLead,
  updateLeadFollowUpOutcome,
  deleteLead,
  markLeadFollowUpHandled,
  rescheduleLeadFollowUp,
  cancelLeadFollowUp,
  getNotifications,
  getNotificationsSummary,
  deleteNotifications,
  getLeadFollowUpHistory,
  getFollowUpCallCompliance,
  getMissedFollowUpCalls,
  getFollowUpCallComplianceSummary,
  getFollowUpLifecycleSummary,
} from "./pixelEye.controller.js";
import {
  authenticateToken,
  authorizeManagementRole,
} from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import {
  validatePixelEyeCreate,
  validatePixelEyeUpdate,
  validatePixelEyeFollowUpOutcome,
} from "../../middlewares/validation/pixelEyeValidation.js";

const router = express.Router();

router.use(authenticateToken);
router.use(attachTenantContext);
router.use(scopeSuperAdminToClient("pixeleye"));

router.get("/", getLeads);
router.get("/export", exportLeads);
router.get("/notifications", getNotifications);
router.get("/notifications/summary", getNotificationsSummary);
router.delete("/notifications", authorizeManagementRole, deleteNotifications);
router.get("/follow-ups/call-compliance", getFollowUpCallCompliance);
router.get("/follow-ups/missed-calls", getMissedFollowUpCalls);
router.get(
  "/follow-ups/call-compliance-summary",
  getFollowUpCallComplianceSummary,
);
router.get("/follow-ups/lifecycle-summary", getFollowUpLifecycleSummary);
router.get("/:id/follow-up/history", getLeadFollowUpHistory);
router.patch("/:id/follow-up/handled", markLeadFollowUpHandled);
router.patch("/:id/follow-up/reschedule", rescheduleLeadFollowUp);
router.patch("/:id/follow-up/cancel", cancelLeadFollowUp);
router.patch(
  "/:id/follow-up-outcome",
  validatePixelEyeFollowUpOutcome,
  updateLeadFollowUpOutcome,
);
router.get("/:id", getLeadById);
router.post("/", validatePixelEyeCreate, createLead);
router.patch("/:id", validatePixelEyeUpdate, updateLead);
router.delete("/:id", authorizeManagementRole, deleteLead);

export default router;
