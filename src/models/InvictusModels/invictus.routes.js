import express from "express";

import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createInvictusRegisterController,
  deleteByIdInvictusRegisterController,
  getAllInvictusRegisterController,
  getByIdInvictusRegisterController,
} from "./invictus.controller.js";

const Router = express.Router();

Router.post("/invictus", createInvictusRegisterController);
Router.get(
  "/invictuses",
  authenticateManagementToken,
  getAllInvictusRegisterController
);
Router.get(
  "/invictus/:id",
  authenticateManagementToken,
  getByIdInvictusRegisterController
);
Router.delete(
  "/invictus/:id",
  authenticateManagementToken,
  deleteByIdInvictusRegisterController
);

export default Router;
