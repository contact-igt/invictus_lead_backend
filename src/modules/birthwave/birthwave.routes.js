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
} from "./birthwave.controller.js";
import { authenticateToken, authorizeManagementRole } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import {
  validateBirthwaveId,
  validateBirthwaveDashboard,
  validateBirthwaveLeadList,
  validateBirthwaveLeadCreate,
  validateBirthwaveLeadUpdate,
  validateBirthwaveDoctorList,
  validateBirthwaveDoctorCreate,
  validateBirthwaveDoctorUpdate,
  validateBirthwaveAppointmentList,
  validateBirthwaveAppointmentCreate,
  validateBirthwaveAppointmentUpdate,
  validateBirthwaveWebsiteLeadList,
  validateBirthwaveWebsiteLeadUpdate,
} from "../../middlewares/validation/birthwaveValidation.js";

const router = express.Router();

router.use(authenticateToken);
router.use(attachTenantContext);
router.use(scopeSuperAdminToClient("birthwave"));

router.get("/dashboard", validateBirthwaveDashboard, getDashboardHandler);

router.get("/doctors", validateBirthwaveDoctorList, getDoctorsHandler);
router.post("/doctors", authorizeManagementRole, validateBirthwaveDoctorCreate, createDoctorHandler);
router.patch("/doctors/:id", authorizeManagementRole, validateBirthwaveId, validateBirthwaveDoctorUpdate, updateDoctorHandler);

router.get("/leads", validateBirthwaveLeadList, getLeadsHandler);
router.post("/leads", validateBirthwaveLeadCreate, createLeadHandler);
router.get("/leads/:id", validateBirthwaveId, getLeadHandler);
router.get("/leads/:id/timeline", validateBirthwaveId, getLeadTimelineHandler);
router.patch("/leads/:id", validateBirthwaveId, validateBirthwaveLeadUpdate, updateLeadHandler);

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
