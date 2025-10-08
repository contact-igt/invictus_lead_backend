import express from "express";

import {
  createKrinstituteRegisterController,
  deleteByIdKrinstituteRegisterController,
  getAllKrinstituteRegisterController,
  getByIdKrinstituteRegisterController,
} from "./krinstitute.controller.js";
import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";

const Router = express.Router();

Router.post("/krinstitute", createKrinstituteRegisterController);
Router.get(
  "/krinstitutes",
  authenticateManagementToken,
  getAllKrinstituteRegisterController
);
Router.get(
  "/krinstitute/:id",
  authenticateManagementToken,
  getByIdKrinstituteRegisterController
);
Router.delete(
  "/krinstitute/:id",
  authenticateManagementToken,
  deleteByIdKrinstituteRegisterController
);

export default Router;
