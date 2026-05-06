import express from "express";
import rateLimit from "express-rate-limit";
import { createPixelEyeWebhook } from "./pixelEyeWebhook.controller.js";
import {
  logWebhookRequest,
  setWebhookSecurityHeaders,
  verifyWebhookApiKey,
} from "../../../middlewares/verifyWebhookApiKey.js";
import { validatePixelEyeWebhookPayload } from "../../../middlewares/validation/pixelEyeWebhookValidation.js";

const router = express.Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RUNO_WEBHOOK_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many webhook requests",
  },
});

router.post(
  "/webhook",
  webhookLimiter,
  setWebhookSecurityHeaders,
  verifyWebhookApiKey,
  logWebhookRequest,
  validatePixelEyeWebhookPayload,
  createPixelEyeWebhook,
);

export default router;
