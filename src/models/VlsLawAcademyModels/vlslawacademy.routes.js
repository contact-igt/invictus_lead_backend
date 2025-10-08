import express from "express";
import {
  createRegisterController,
  deleteRegisterController,
  getAllRegisterController,
  getByIdRegisterController,
} from "./vlslawacademy.controller.js";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";

const Router = express.Router();

Router.post("/vls-law-academy", createRegisterController);
Router.get("/vls-law-academys", authenticateManagementToken,  getAllRegisterController);
Router.get("/vls-law-academy/:id", authenticateManagementToken,  getByIdRegisterController);
Router.delete("/vls-law-academy/:id", authenticateManagementToken,  deleteRegisterController);

export default Router;
