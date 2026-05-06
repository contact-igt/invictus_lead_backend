import express from "express";
import { loginController } from "./auth.controller.js";

const router = express.Router();

router.post("/login", loginController);

export default router;
