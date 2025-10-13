import express from "express";

import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createNetralyaRegisterController,
  deleteByIdNetralyaRegisterController,
  getAllNetralyaRegisterController,
  getByIdNetralyaRegisterController,
} from "./netralya.controller.js";

const Router = express.Router();

Router.post("/netralaya", createNetralyaRegisterController);
Router.get(
  "/netralayas",
  authenticateManagementToken,
  getAllNetralyaRegisterController
);
Router.get(
  "/netralaya/:id",
  authenticateManagementToken,
  getByIdNetralyaRegisterController
);
Router.delete(
  "/netralaya/:id",
  authenticateManagementToken,
  deleteByIdNetralyaRegisterController
);

export default Router;
