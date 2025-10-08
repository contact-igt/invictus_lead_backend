import express from "express";

import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createMirrabuildersRegisterController,
  deleteByIdMirrabuildersRegisterController,
  getAllMirrabuildersRegisterController,
  getByIdMirrabuildersRegisterController,
} from "./mirrabuilder.controller.js";

const Router = express.Router();

Router.post("/mirra-builder", createMirrabuildersRegisterController);
Router.get(
  "/mirra-builders",
  authenticateManagementToken,
  getAllMirrabuildersRegisterController
);
Router.get(
  "/mirra-builder/:id",
  authenticateManagementToken,
  getByIdMirrabuildersRegisterController
);
Router.delete(
  "/mirra-builder/:id",
  authenticateManagementToken,
  deleteByIdMirrabuildersRegisterController
);

export default Router;
