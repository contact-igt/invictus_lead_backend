import express from "express";

import { authenticateManagementToken } from "../../middlewares/auth/authMiddlewares.js";
import {
  createInvictusmetaRegisterController,
  deleteByIdInvictusmetaRegisterController,
  getAllInvictusmetaRegisterController,
  getByIdInvictusmetaRegisterController,
} from "./invictusmeta.controller.js";

const Router = express.Router();

Router.post("/invictus-meta", createInvictusmetaRegisterController);
Router.get(
  "/invictus-metas",
  authenticateManagementToken,
  getAllInvictusmetaRegisterController
);
Router.get(
  "/invictus-meta/:id",
  authenticateManagementToken,
  getByIdInvictusmetaRegisterController
);
Router.delete(
  "/invictus-meta/:id",
  authenticateManagementToken,
  deleteByIdInvictusmetaRegisterController
);

export default Router;
