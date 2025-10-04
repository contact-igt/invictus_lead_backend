import express from "express";
import {
  createRegisterController,
  deleteRegisterController,
  getAllRegisterController,
  getByIdRegisterController,
} from "./vlslawacademy.controller.js";

const Router = express.Router();

Router.post("/vls-law-academy", createRegisterController);
Router.get("/vls-law-academys", getAllRegisterController);
Router.get("/vls-law-academy/:id", getByIdRegisterController);
Router.delete("/vls-law-academy/:id", deleteRegisterController);

export default Router;
