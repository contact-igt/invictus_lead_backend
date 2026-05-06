import express from "express";
import {
  getUsers,
  getUser,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
} from "./users.controller.js";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import {
  validateCreateUser,
  validateUpdateUser,
} from "../../middlewares/validation/usersValidation.js";

const router = express.Router();

router.use(authenticateManagementToken);
router.use(attachTenantContext);

router.get("/", getUsers);
router.get("/:id", getUser);
router.post("/", validateCreateUser, createUserHandler);
router.patch("/:id", validateUpdateUser, updateUserHandler);
router.delete("/:id", deleteUserHandler);

export default router;
