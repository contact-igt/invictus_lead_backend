import assert from "node:assert/strict";
import {
  buildAaravSheetPayload,
  sendAaravSheetRecord,
} from "../modules/aaravEyeCare/aaravEyeCareSheetSync.service.js";
import {
  aaravEyeCareCreateSchema,
  aaravEyeCarePublicCreateSchema,
} from "../middlewares/validation/aaravEyeCareValidation.js";

// Test 1: Payload mapping
const testLead = {
  id: 101,
  name: "Rajesh Kumar",
  mobile_number: "9876543210",
  service: "Cataract Surgery",
  message: "Looking for consultation",
  source: "Quick Booking Popup",
  ip_address: "103.21.244.2",
  utm_source: "Google Ads",
};

const payload = buildAaravSheetPayload(testLead);
assert.equal(payload.name, "Rajesh Kumar");
assert.equal(payload.phone, "9876543210");
assert.equal(payload.service, "Cataract Surgery");
assert.equal(payload.message, "Looking for consultation");
assert.equal(payload.source, "Quick Booking Popup");
assert.equal(payload.ip_address, "103.21.244.2");
assert.equal(payload.utm_source, "Google Ads");

// Test 2: sendAaravSheetRecord success with mock fetch
let requestedUrl = "";
let capturedBody = "";

await sendAaravSheetRecord(testLead, {
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    capturedBody = options.body.toString();
    return new Response(JSON.stringify({ result: "success" }), { status: 200 });
  },
});

assert(
  requestedUrl.includes("script.google.com"),
  "Must post to Google Apps Script endpoint",
);
assert(capturedBody.includes("Rajesh+Kumar") || capturedBody.includes("Rajesh%20Kumar"));
assert(capturedBody.includes("9876543210"));
assert(capturedBody.includes("Cataract+Surgery") || capturedBody.includes("Cataract%20Surgery"));
assert(capturedBody.includes("Quick+Booking+Popup") || capturedBody.includes("Quick%20Booking%20Popup"));

// Test 3: sendAaravSheetRecord failure when endpoint returns non-200
await assert.rejects(
  async () => {
    await sendAaravSheetRecord(testLead, {
      fetchImpl: async () => new Response("Internal Server Error", { status: 500 }),
    });
  },
  /Google Sheets webhook responded 500/,
);

// Test 4: sendAaravSheetRecord failure when Apps Script returns { result: "error" }
await assert.rejects(
  async () => {
    await sendAaravSheetRecord(testLead, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ result: "error", error: "Bad input" }), {
          status: 200,
        }),
    });
  },
  /Google Sheets webhook rejected the row/,
);

// Test 5: Validation schemas accept message and source
const validCreate = aaravEyeCareCreateSchema.validate({
  name: "Priya Sharma",
  mobile_number: "9876543211",
  service: "Lasik - Specs Removal",
  message: "Want to book appointment",
  source: "Cashless Eligibility Form",
});
assert.equal(validCreate.error, undefined, "Create schema must accept message and source");

const validPublicCreate = aaravEyeCarePublicCreateSchema.validate({
  name: "Priya Sharma",
  mobile_number: "9876543211",
  service: "Lasik - Specs Removal",
  message: "Want to book appointment",
  source: "Cashless Eligibility Form",
  client_key: "aarav_eye_care",
});
assert.equal(
  validPublicCreate.error,
  undefined,
  "Public create schema must accept message and source",
);

console.log("Aarav Eye Care Google Sheets sync verification passed.");
