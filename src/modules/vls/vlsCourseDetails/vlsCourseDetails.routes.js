import express from "express";
import {
  registerVlsCourseDetailsHandler,
  createVlsCourseDetailsAdminHandler,
  updateVlsCourseDetailsHandler,
  getVlsCourseDetailsHandler,
  getVlsCourseDetailsByIdHandler,
  deleteVlsCourseDetailsHandler,
} from "./vlsCourseDetails.controller.js";
import { resolvePublicTenantForModule } from "../../../middlewares/auth/publicTenantMiddleware.js";
import { authenticateToken } from "../../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../../middlewares/auth/clientContextMiddleware.js";
import { validateVlsCourseDetails } from "../../../middlewares/validation/vlsCourseDetailsValidation.js";

const router = express.Router();

// Public: vls-frontend's Enroll Now / Download Syllabus / course-page
// Register Now forms, for ANY course (X-Client-Key: vls_law).
router.post(
  "/register",
  resolvePublicTenantForModule("vls_law"),
  validateVlsCourseDetails,
  registerVlsCourseDetailsHandler,
);

// Protected: Admin CRUD
router.use(authenticateToken, attachTenantContext, scopeSuperAdminToClient("vls_law"));
router.get("/", getVlsCourseDetailsHandler);
router.get("/:id", getVlsCourseDetailsByIdHandler);
router.post("/", validateVlsCourseDetails, createVlsCourseDetailsAdminHandler);
router.patch("/:id", updateVlsCourseDetailsHandler);
router.delete("/:id", deleteVlsCourseDetailsHandler);

export default router;
