import express from "express";
import {
  getDynamicData,
  getDynamicDataById,
  createDynamicData,
  updateDynamicData,
  deleteDynamicData,
  listDynamicModels,
} from "./dynamic.controller.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { validateDynamicRecord } from "../../middlewares/validation/dynamicValidation.js";

const router = express.Router();

router.use(authenticateToken);
router.use(attachTenantContext);

router.get("/models", listDynamicModels);
router.get("/:model", getDynamicData);
router.get("/:model/:id", getDynamicDataById);
router.post("/:model", validateDynamicRecord, createDynamicData);
router.patch("/:model/:id", validateDynamicRecord, updateDynamicData);
router.delete("/:model/:id", deleteDynamicData);

export default router;
