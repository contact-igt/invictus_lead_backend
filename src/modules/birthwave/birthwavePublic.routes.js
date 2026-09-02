import express from "express";
import { postWebsiteLeadPublicHandler } from "./birthwave.controller.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import { validateBirthwaveWebsiteLeadPublic } from "../../middlewares/validation/birthwaveValidation.js";

const router = express.Router();

/**
 * Public lead intake for the Birthwave website + landing pages.
 *
 *   POST /api/v1/birthwave-public/leads
 *   Header: X-Client-Key: birthwave   (or body.client_key)
 *   Body:   { source_key, name, phone, email?, service?, message?, consent?,
 *             lead_id?, attribution?: { source, campaign, creative, channel,
 *             landing_page, referrer, utm_*, gclid, fbclid } }
 *
 * The row is stored immediately, then mirrored to the source's Google Sheet
 * server-side (retried up to 3 times by the sheet-sync worker).
 */
router.post(
  "/leads",
  resolvePublicTenantForModule("birthwave"),
  validateBirthwaveWebsiteLeadPublic,
  postWebsiteLeadPublicHandler,
);

export default router;
