import express from "express";
import {
  createRamananFinancialRegisterController,
  deleteByIdRamananFinancialRegisterController,
  getAllRamananFinancialRegisterController,
  getByIdRamananFinancialRegisterController,
} from "./ramananfinancial.controller.js";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";

const Router = express.Router();

Router.post("/rv-financial-vision", createRamananFinancialRegisterController);
Router.get(
  "/rv-financial-visions",
  authenticateManagementToken,
  getAllRamananFinancialRegisterController
);
Router.get(
  "/rv-financial-vision/:id",
  authenticateManagementToken,
  getByIdRamananFinancialRegisterController
);
Router.delete(
  "/rv-financial-vision/:id",
  authenticateManagementToken,
  deleteByIdRamananFinancialRegisterController
);

export default Router;
