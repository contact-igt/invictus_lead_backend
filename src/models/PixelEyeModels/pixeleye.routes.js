import express from "express";
import {
  createPixelRegisterController,
  deleteByIdPixelRegisterController,
  getAllPixelRegisterController,
  getByIdPixelRegisterController,
} from "./pixeleye.controller.js";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";

const Router = express.Router();

Router.post("/pixel-eye", createPixelRegisterController);
Router.get(
  "/pixel-eyes",
  authenticateManagementToken,
  getAllPixelRegisterController
);
Router.get(
  "/pixel-eye/:id",
  authenticateManagementToken,
  getByIdPixelRegisterController
);
Router.delete(
  "/pixel-eye/:id",
  authenticateManagementToken,
  deleteByIdPixelRegisterController
);

export default Router;
