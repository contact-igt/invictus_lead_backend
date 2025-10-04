import express from "express";
import { createPixelRegisterController, getAllPixelRegisterController } from "./pixeleye.controller.js";

const Router = express.Router();

Router.post("/pixel-eye", createPixelRegisterController);
Router.get("/pixel-eyes" , getAllPixelRegisterController)

export default Router;
