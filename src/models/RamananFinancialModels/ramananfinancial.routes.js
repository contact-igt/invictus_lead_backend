import express from "express";
import {
  createRamananFinancialRegisterController,
  deleteByIdRamananFinancialRegisterController,
  getAllRamananFinancialRegisterController,
  getByIdRamananFinancialRegisterController,
} from "./ramananfinancial.controller.js";

const Router = express.Router();

Router.post("/rv-financial-vision", createRamananFinancialRegisterController);
Router.get("/rv-financial-visions", getAllRamananFinancialRegisterController);
Router.get(
  "/rv-financial-vision/:id",
  getByIdRamananFinancialRegisterController
);
Router.delete(
  "/rv-financial-vision/:id",
  deleteByIdRamananFinancialRegisterController
);

export default Router;
