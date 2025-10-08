import express from "express";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createMahimmyRegisterController,
  deleteByIdMahimmyRegisterController,
  getAllMahimmyRegisterController,
  getByIdMahimmyRegisterController,
} from "./mahimmyfoods.controller.js";

const Router = express.Router();

Router.post("/mahimmy-food", createMahimmyRegisterController);
Router.get(
  "/mahimmy-foods",
  authenticateManagementToken,
  getAllMahimmyRegisterController
);
Router.get(
  "/mahimmy-food/:id",
  authenticateManagementToken,
  getByIdMahimmyRegisterController
);
Router.delete(
  "/mahimmy-foods/:id",
  authenticateManagementToken,
  deleteByIdMahimmyRegisterController
);

export default Router;
