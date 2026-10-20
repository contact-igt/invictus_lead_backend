import express from "express";
import rateLimit from "express-rate-limit";
import { verifyBirthwaveSignature } from "../../middlewares/verifyBirthwaveSignature.js";
import { validateIntake } from "../../middlewares/validation/birthwaveClinicRegistrationValidation.js";
import { ingestClinicRegistration } from "./birthwaveClinicRegistration.service.js";

const router = express.Router();

const intakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.BIRTHWAVE_CLINIC_INTAKE_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests" },
});

// Patient data: keep request/response bodies out of the API audit log.
const protectPatientData = (req, res, next) => {
  res.locals.auditOmitBodies = true;
  res.setHeader("Cache-Control", "no-store");
  next();
};

/**
 * Check-in app -> CRM (server to server, no user auth).
 *
 *   POST /api/v1/integrations/birthwave/clinic-registrations
 *   Headers: Idempotency-Key, X-Birthwave-Timestamp, X-Birthwave-Signature
 *
 * 201 = lead created, 409 = reference already stored (the sender treats both
 * as success), anything else is retried by the sender.
 */
router.post("/", protectPatientData, intakeLimiter, verifyBirthwaveSignature, validateIntake, async (req, res, next) => {
  try {
    const keyHeader = String(req.headers["idempotency-key"] || "").trim();
    if (keyHeader && keyHeader !== req.body.reference) {
      return res.status(400).json({ success: false, message: "Idempotency-Key mismatch" });
    }
    const { created } = await ingestClinicRegistration(req.body);
    return res.status(created ? 201 : 409).json({
      success: true,
      message: created ? "Registration stored" : "Reference already stored",
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
