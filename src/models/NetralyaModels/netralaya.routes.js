import express from "express";

import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createNetralyaRegisterController,
  deleteByIdNetralyaRegisterController,
  getAllNetralyaRegisterController,
  getByIdNetralyaRegisterController,
} from "./netralya.controller.js";

const Router = express.Router();

Router.post("/netralya", createNetralyaRegisterController);
Router.get(
  "/netralyas",
  authenticateManagementToken,
  getAllNetralyaRegisterController
);
Router.get(
  "/netralya/:id",
  authenticateManagementToken,
  getByIdNetralyaRegisterController
);
Router.delete(
  "/netralya/:id",
  authenticateManagementToken,
  deleteByIdNetralyaRegisterController
);

export default Router;
