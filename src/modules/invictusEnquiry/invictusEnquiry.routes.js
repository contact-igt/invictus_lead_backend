import { Router } from "express";
import {
  postGeneralEnquiryPublic,
  postCareersApplicationPublic,
  getGeneralEnquiries,
  getGeneralEnquiryLocations,
  patchGeneralEnquiry,
  getCareersApplications,
  getCareersApplicationLocations,
  patchCareersApplication,
  exportCareersApplications,
  removeGeneralEnquiry,
  removeCareersApplication,
} from "./invictusEnquiry.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";

const router = Router();

// Public website submission routes (no auth required)
router.post("/general/public", postGeneralEnquiryPublic);
router.post("/careers/public", postCareersApplicationPublic);

// Admin management routes (requires valid login)
router.get("/general", authenticateToken, getGeneralEnquiries);
router.get("/general/locations", authenticateToken, getGeneralEnquiryLocations);
router.patch("/general/:id", authenticateToken, patchGeneralEnquiry);
router.delete("/general/:id", authenticateToken, removeGeneralEnquiry);

router.get("/careers", authenticateToken, getCareersApplications);
router.get("/careers/locations", authenticateToken, getCareersApplicationLocations);
router.get("/careers/export", authenticateToken, exportCareersApplications);
router.patch("/careers/:id", authenticateToken, patchCareersApplication);
router.delete("/careers/:id", authenticateToken, removeCareersApplication);

export default router;
