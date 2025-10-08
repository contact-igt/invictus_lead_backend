import express from "express";
import {
  createManagementController,
  loginManagementController,
} from "./management.controller.js";
import { authenticateSuperAdminToken } from "../../middlewares/auth/authMiddlewares.js";

const Router = express.Router();

Router.post(
  "/management",
  authenticateSuperAdminToken,
  createManagementController
);
Router.post("/management/login", loginManagementController);

export default Router;
