import express from "express";
import { authenticateSuperAdminToken } from "../../middlewares/auth/authMiddlewares.js";
import { getApiLogHandler, getApiLogSummaryHandler, listApiLogsHandler } from "./apiLogs.controller.js";

const router = express.Router();
router.use(authenticateSuperAdminToken);
router.get("/summary", getApiLogSummaryHandler);
router.get("/", listApiLogsHandler);
router.get("/:id", getApiLogHandler);
export default router;
