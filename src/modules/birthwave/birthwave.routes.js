import express from "express";
import {
  getDashboardHandler,
  getDoctorsHandler,
  createDoctorHandler,
  updateDoctorHandler,
  getLeadsHandler,
  getLeadHandler,
  getLeadTimelineHandler,
  createLeadHandler,
  updateLeadHandler,
  addLeadNoteHandler,
  getAppointmentsHandler,
  createAppointmentHandler,
  updateAppointmentHandler,
  getWebsiteLeadsHandler,
  getWebsiteLeadSourcesHandler,
  getWebsiteLeadHandler,
  updateWebsiteLeadHandler,
  deleteWebsiteLeadHandler,
  retryWebsiteLeadSheetSyncHandler,
  retryFailedWebsiteLeadSheetSyncsHandler,
  promoteWebsiteLeadHandler,
  getDispositionOptionsHandler,
  listLeadOutcomesHandler,
} from "./birthwave.controller.js";
import { authenticateToken, authorizeManagementRole } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import {
  validateBirthwaveId,
  validateBirthwaveTeamMemberId,
  validateBirthwaveDashboard,
  validateBirthwaveLeadList,
  validateBirthwaveLeadCreate,
  validateBirthwaveLeadUpdate,
  validateBirthwaveLeadNote,
  validateBirthwaveTaskList,
  validateBirthwaveTaskCreate,
  validateBirthwaveTaskStart,
  validateBirthwaveTaskComplete,
  validateBirthwaveTaskReschedule,
  validateBirthwaveTaskCancel,
  validateBirthwaveDoctorList,
  validateBirthwaveDoctorCreate,
  validateBirthwaveDoctorUpdate,
  validateBirthwaveAppointmentList,
  validateBirthwaveAppointmentCreate,
  validateBirthwaveAppointmentUpdate,
  validateBirthwaveWebsiteLeadList,
  validateBirthwaveWebsiteLeadUpdate,
  validateBirthwaveTeamList,
  validateBirthwaveTeamCreate,
  validateBirthwaveTeamUpdate,
  validateBirthwaveTeamMemberCreate,
  validateBirthwaveTeamMemberUpdate,
  validateBirthwaveAssignment,
  validateBirthwaveBulkAssignment,
  validateBirthwaveAssignmentRuleCreate,
  validateBirthwaveAssignmentRuleUpdate,
  validateBirthwaveWorkQuery,
  validateBirthwaveOutcome,
  validateBirthwaveAttentionList,
  validateBirthwaveAttentionReconcile,
  validateBirthwaveAttentionAction,
  validateBirthwaveServiceList,
  validateBirthwaveServiceCreate,
  validateBirthwaveServiceUpdate,
  validateBirthwaveServiceReorder,
} from "../../middlewares/validation/birthwaveValidation.js";
import {
  listTeamsHandler, createTeamHandler, getTeamHandler, updateTeamHandler,
  listTeamMembersHandler, addTeamMemberHandler, updateTeamMemberHandler,
  getMyTeamMembershipsHandler, listAssignmentRulesHandler, createAssignmentRuleHandler,
  updateAssignmentRuleHandler, listManagementCandidatesHandler,
} from "./birthwaveTeam.controller.js";
import { assignLeadHandler, bulkAssignLeadsHandler, routeLeadHandler, listLeadAssignmentsHandler } from "./birthwaveAssignment.controller.js";
import { listServicesHandler, createServiceHandler, updateServiceHandler, reorderServicesHandler } from "./birthwaveService.controller.js";
import { listTasksHandler, getTaskHandler, createTaskHandler, startTaskHandler, completeTaskHandler, rescheduleTaskHandler, cancelTaskHandler } from "./birthwaveTask.controller.js";
import { recordTaskOutcomeHandler } from "./birthwaveOutcome.controller.js";
import { getMyWorkHandler, getTeamWorkHandler } from "./birthwaveWork.controller.js";
import { listAttentionHandler, getAttentionHandler, acknowledgeAttentionHandler, resolveAttentionHandler, dismissAttentionHandler, reconcileAttentionHandler } from "./birthwaveAttention.controller.js";

const router = express.Router();

router.use(authenticateToken);
router.use(attachTenantContext);
router.use(scopeSuperAdminToClient("birthwave"));

router.get("/dashboard", validateBirthwaveDashboard, getDashboardHandler);
router.get("/attention", validateBirthwaveAttentionList, listAttentionHandler);
router.post("/attention/reconcile", validateBirthwaveAttentionReconcile, reconcileAttentionHandler);
router.get("/attention/:id", validateBirthwaveId, getAttentionHandler);
router.post("/attention/:id/acknowledge", validateBirthwaveId, validateBirthwaveAttentionAction, acknowledgeAttentionHandler);
router.post("/attention/:id/resolve", validateBirthwaveId, validateBirthwaveAttentionAction, resolveAttentionHandler);
router.post("/attention/:id/dismiss", validateBirthwaveId, validateBirthwaveAttentionAction, dismissAttentionHandler);

router.get("/teams/me", getMyTeamMembershipsHandler);
router.get("/teams/candidates", listManagementCandidatesHandler);
router.get("/teams", validateBirthwaveTeamList, listTeamsHandler);
router.post("/teams", validateBirthwaveTeamCreate, createTeamHandler);
router.get("/teams/:id", validateBirthwaveId, getTeamHandler);
router.patch("/teams/:id", validateBirthwaveId, validateBirthwaveTeamUpdate, updateTeamHandler);
router.get("/teams/:id/members", validateBirthwaveId, listTeamMembersHandler);
router.post("/teams/:id/members", validateBirthwaveId, validateBirthwaveTeamMemberCreate, addTeamMemberHandler);
router.patch("/teams/:id/members/:memberId", validateBirthwaveTeamMemberId, validateBirthwaveTeamMemberUpdate, updateTeamMemberHandler);

// BW-SVC-001: the service master. Read is available to any authenticated
// Birthwave user (Lead forms and filters need it); every write is admin-only,
// enforced in birthwaveService.service.js rather than by route middleware alone.
router.get("/services", validateBirthwaveServiceList, listServicesHandler);
router.post("/services", validateBirthwaveServiceCreate, createServiceHandler);
router.post("/services/reorder", validateBirthwaveServiceReorder, reorderServicesHandler);
router.patch("/services/:id", validateBirthwaveId, validateBirthwaveServiceUpdate, updateServiceHandler);

router.get("/assignment-rules", listAssignmentRulesHandler);
router.post("/assignment-rules", validateBirthwaveAssignmentRuleCreate, createAssignmentRuleHandler);
router.patch("/assignment-rules/:id", validateBirthwaveId, validateBirthwaveAssignmentRuleUpdate, updateAssignmentRuleHandler);

router.get("/doctors", validateBirthwaveDoctorList, getDoctorsHandler);
router.post("/doctors", authorizeManagementRole, validateBirthwaveDoctorCreate, createDoctorHandler);
router.patch("/doctors/:id", authorizeManagementRole, validateBirthwaveId, validateBirthwaveDoctorUpdate, updateDoctorHandler);

router.get("/leads", validateBirthwaveLeadList, getLeadsHandler);
router.get("/tasks", validateBirthwaveTaskList, listTasksHandler);
router.get("/dispositions", getDispositionOptionsHandler);
router.get("/work/my", validateBirthwaveWorkQuery, getMyWorkHandler);
router.get("/work/team", validateBirthwaveWorkQuery, getTeamWorkHandler);
router.post("/tasks", validateBirthwaveTaskCreate, createTaskHandler);
router.get("/tasks/:id", validateBirthwaveId, getTaskHandler);
router.post("/tasks/:id/start", validateBirthwaveId, validateBirthwaveTaskStart, startTaskHandler);
router.post("/tasks/:id/complete", validateBirthwaveId, validateBirthwaveTaskComplete, completeTaskHandler);
router.post("/tasks/:id/reschedule", validateBirthwaveId, validateBirthwaveTaskReschedule, rescheduleTaskHandler);
router.post("/tasks/:id/cancel", validateBirthwaveId, validateBirthwaveTaskCancel, cancelTaskHandler);
router.post("/tasks/:id/outcome", validateBirthwaveId, validateBirthwaveOutcome, recordTaskOutcomeHandler);
router.post("/leads/bulk-assign", validateBirthwaveBulkAssignment, bulkAssignLeadsHandler);
router.post("/leads", validateBirthwaveLeadCreate, createLeadHandler);
router.get("/leads/:id", validateBirthwaveId, getLeadHandler);
router.get("/leads/:id/timeline", validateBirthwaveId, getLeadTimelineHandler);
router.get("/leads/:id/outcomes", validateBirthwaveId, listLeadOutcomesHandler);
router.get("/leads/:id/assignments", validateBirthwaveId, listLeadAssignmentsHandler);
router.post("/leads/:id/assign", validateBirthwaveId, validateBirthwaveAssignment, assignLeadHandler);
router.post("/leads/:id/route", validateBirthwaveId, routeLeadHandler);
router.patch("/leads/:id", validateBirthwaveId, validateBirthwaveLeadUpdate, updateLeadHandler);
router.post("/leads/:id/notes", validateBirthwaveId, validateBirthwaveLeadNote, addLeadNoteHandler);

router.get("/appointments", validateBirthwaveAppointmentList, getAppointmentsHandler);
router.post("/appointments", validateBirthwaveAppointmentCreate, createAppointmentHandler);
router.patch("/appointments/:id", validateBirthwaveId, validateBirthwaveAppointmentUpdate, updateAppointmentHandler);

// Website / landing-page enquiries (read + light lifecycle management)
router.get("/website-leads", validateBirthwaveWebsiteLeadList, getWebsiteLeadsHandler);
router.get("/website-leads/sources", getWebsiteLeadSourcesHandler);
router.post("/website-leads/retry-failed-sheet-sync", authorizeManagementRole, retryFailedWebsiteLeadSheetSyncsHandler);
router.get("/website-leads/:id", validateBirthwaveId, getWebsiteLeadHandler);
router.patch("/website-leads/:id", validateBirthwaveId, validateBirthwaveWebsiteLeadUpdate, updateWebsiteLeadHandler);
router.delete("/website-leads/:id", authorizeManagementRole, validateBirthwaveId, deleteWebsiteLeadHandler);
router.post("/website-leads/:id/retry-sheet-sync", authorizeManagementRole, validateBirthwaveId, retryWebsiteLeadSheetSyncHandler);
router.post("/website-leads/:id/promote", authorizeManagementRole, validateBirthwaveId, promoteWebsiteLeadHandler);

export default router;
