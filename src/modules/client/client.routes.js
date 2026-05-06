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
} from "../../middlewares/validation/clientValidation.js";

const router = express.Router();

router.use(authenticateSuperAdminToken);

router.get("/", getClients);
router.get("/:id", getClientById);
router.post("/", validateCreateClient, createClientRecord);
router.patch("/:id", validateUpdateClient, updateClientRecord);
router.delete("/:id", deleteClientRecord);

export default router;
