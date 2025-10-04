import express from "express";
import {
  createManagementController,
  loginManagementController,
} from "./management.controller.js";

const Router = express.Router();

Router.post("/management", createManagementController);
Router.post("/management/login", loginManagementController);

export default Router;
