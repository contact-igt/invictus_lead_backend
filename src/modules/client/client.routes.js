import express from "express";
import {
  getClients,
  getClientById,
  createClientRecord,
  updateClientRecord,
  deleteClientRecord,
} from "./client.controller.js";
import { authenticateSuperAdminToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  validateCreateClient,
  validateUpdateClient,
  validateClientId,
} from "../../middlewares/validation/clientValidation.js";

const router = express.Router();

router.use(authenticateSuperAdminToken);

router.get("/", getClients);
router.get("/:id", validateClientId, getClientById);
router.post("/", validateCreateClient, createClientRecord);
router.patch("/:id", validateClientId, validateUpdateClient, updateClientRecord);
router.delete("/:id", validateClientId, deleteClientRecord);

export default router;


