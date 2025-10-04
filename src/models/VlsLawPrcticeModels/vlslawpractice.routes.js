import express from "express";
import {
  createRegisterController,
  deleteRegisterController,
  getAllRegisterController,
  getByIdRegisterController,
} from "./vlslawpractice.controller.js";

const Router = express.Router();

Router.post("/vls-law-practice", createRegisterController);
Router.get("/vls-law-practices", getAllRegisterController);
Router.get("/vls-law-practice/:id", getByIdRegisterController);
Router.delete("/vls-law-practice/:id", deleteRegisterController);

export default Router;
