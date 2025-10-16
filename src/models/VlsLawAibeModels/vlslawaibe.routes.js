import express from "express";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createRegisterController,
  deleteRegisterController,
  getAllRegisterController,
  getByIdRegisterController,
} from "./vlslawaibe.controller.js";

const Router = express.Router();

Router.post("/vls-law-aibe", createRegisterController);

Router.get(
  "/vls-law-aibes",
  authenticateManagementToken,
  getAllRegisterController
);
Router.get(
  "/vls-law-aibe/:id",
  authenticateManagementToken,
  getByIdRegisterController
);
Router.delete(
  "/vls-law-aibe/:id",
  authenticateManagementToken,
  deleteRegisterController
);

export default Router;
