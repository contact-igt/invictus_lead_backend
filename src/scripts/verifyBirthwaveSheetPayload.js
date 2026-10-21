import assert from "node:assert/strict";
import { buildSheetPayload } from "../modules/birthwave/birthwaveSheetSync.service.js";

const payload = buildSheetPayload(
  { id: 1, name: "Test lead", service: "General Contact" },
  { BIRTHWAVE_SHEET_WEBHOOK_SECRET: "test-secret" },
);

assert.equal(payload.secret, "test-secret");
assert.equal(payload.serviceCode, "general-contact");
console.log("Birthwave sheet payload verification passed.");
