import express from "express";
import {
  createPixelRegisterController,
  deleteByIdPixelRegisterController,
  getAllPixelRegisterController,
  getByIdPixelRegisterController,
} from "./pixeleye.controller.js";

const Router = express.Router();

Router.post("/pixel-eye", createPixelRegisterController);
Router.get("/pixel-eyes", getAllPixelRegisterController);
Router.get("/pixel-eye/:id", getByIdPixelRegisterController);
Router.delete("/pixel-eye/:id", deleteByIdPixelRegisterController);

export default Router;
