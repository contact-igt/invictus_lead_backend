import express from "express";
import rateLimit from "express-rate-limit";
import { handleRepliBirthwaveWebhook } from "./repliWebhook.controller.js";
import { handleRepliBirthwaveSync } from "./repliSync.controller.js";
import { authenticateManagementToken } from "../../../middlewares/auth/authMiddlewares.js";

const router = express.Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.REPLI_BIRTHWAVE_WEBHOOK_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many webhook requests" },
});

const setWebhookSecurityHeaders = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
};

/**
 * Repli → IGT (Birthwave) outgoing webhook.
 *
 *   POST /api/v1/integrations/repli/birthwave/webhook
 *
 * No IGT user auth — the request is authenticated by its HMAC-SHA256
 * `X-Repli-Signature` (verified in the service against
 * REPLI_BIRTHWAVE_WEBHOOK_SECRET over the raw request body).
 * Only POST is routed; every other method falls through to the 404 handler.
 */
router.post(
  "/birthwave/webhook",
  webhookLimiter,
  setWebhookSecurityHeaders,
  handleRepliBirthwaveWebhook,
);

/**
 * IGT-admin-triggered historical lead import.
 *
 *   POST /api/v1/integrations/repli/birthwave/sync
 *
 * NOT a webhook — normal IGT auth (super-admin/admin), no X-Repli-Signature.
 * Birthwave is resolved server-side the same way as the webhook; REPLI_API_KEY
 * (IGT → Repli) is a distinct secret from REPLI_BIRTHWAVE_WEBHOOK_SECRET
 * (Repli → IGT) and is used only inside repliApi.service.js.
 */
router.post(
  "/birthwave/sync",
  authenticateManagementToken,
  handleRepliBirthwaveSync,
);

export default router;
