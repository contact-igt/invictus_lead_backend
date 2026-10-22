import assert from "node:assert/strict";
import { intakeSchema } from "../middlewares/validation/birthwaveClinicRegistrationValidation.js";

const registration = {
  event: "clinic_registration.created",
  reference: "BW-20261022-M-0001",
  clinicId: "main",
  clinicDate: "2026-10-22",
  session: "morning",
  registeredAt: "2026-10-22T12:00:00.000Z",
  lead: {
    source: "clinic_registration",
    name: "Test Patient",
    phone: "+919876543210",
    concerns: ["pregnancy"],
    sources: ["google_search"],
    consent: true,
  },
};

const { error, value } = intakeSchema.validate(registration, { abortEarly: false, convert: true });
assert.equal(error, undefined, error?.details.map((detail) => detail.message).join(", "));
assert.equal(value.session, "morning");

console.log("Birthwave clinic registration validation checks passed.");
