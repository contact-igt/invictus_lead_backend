import express from "express";
import rateLimit from "express-rate-limit";
import { loginController, refreshController } from "./auth.controller.js";

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts. Please try again later.",
  },
});

router.post("/login", authLimiter, loginController);
router.post("/refresh", authLimiter, refreshController);

export default router;
