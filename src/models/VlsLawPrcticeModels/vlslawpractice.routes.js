import express from "express";
import {
  createRegisterController,
  deleteRegisterController,
  getAllRegisterController,
  getByIdRegisterController,
} from "./vlslawpractice.controller.js";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";

const Router = express.Router();

Router.post("/vls-law-practice", createRegisterController);
Router.get(
  "/vls-law-practices",
  authenticateManagementToken,
  getAllRegisterController
);
Router.get(
  "/vls-law-practice/:id",
  authenticateManagementToken,
  getByIdRegisterController
);
Router.delete(
  "/vls-law-practice/:id",
  authenticateManagementToken,
  deleteRegisterController
);

export default Router;
