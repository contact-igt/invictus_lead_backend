import express from "express";
import {
  createWellinitRegisterController,
  deleteByIdWellinitRegisterController,
  getAllWellinitRegisterController,
  getByIdWellinitRegisterController,
} from "./wellinit.controller.js";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";

const Router = express.Router();

Router.post("/wellinit", createWellinitRegisterController);
Router.get(
  "/wellinits",
  authenticateManagementToken,
  getAllWellinitRegisterController
);
Router.get(
  "/wellinit/:id",
  authenticateManagementToken,
  getByIdWellinitRegisterController
);
Router.delete(
  "/wellinit/:id",
  authenticateManagementToken,
  deleteByIdWellinitRegisterController
);

export default Router;
