import express from "express";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createNaitrikaRegisterController,
  deleteByIdNaitrikaRegisterController,
  getAllNaitrikaRegisterController,
  getByIdNaitrikaRegisterController,
} from "./naitrika.controller.js";

const Router = express.Router();

Router.post("/naitrika", createNaitrikaRegisterController);
Router.get(
  "/naitrikas",
  authenticateManagementToken,
  getAllNaitrikaRegisterController
);
Router.get(
  "/naitrika/:id",
  authenticateManagementToken,
  getByIdNaitrikaRegisterController
);
Router.delete(
  "/naitrika/:id",
  authenticateManagementToken,
  deleteByIdNaitrikaRegisterController
);

export default Router;
