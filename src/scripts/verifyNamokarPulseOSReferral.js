import assert from "node:assert/strict";
import test from "node:test";
import { deliver as deliverNamokarLead } from "../modules/namokar/namokar.service.js";
import { syncToPulseOS } from "../modules/namokarOculoplasty/namokarOculoplasty.service.js";

test("forwards a Namokar referral code to PulseOS", async () => {
  const fetchBefore = globalThis.fetch;
  const tokenBefore = process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN;
  let payload;
  process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN = "test-token";
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await syncToPulseOS({ submission_id: "namokar-referral-smoke", form_name: "namokar-home-popup-v1", name: "Smoke Test", phone: "+919876543210", email: null, service: "cataract", message: null, page_url: null, form_payload_json: { referralCode: "REFERRAL10" }, pulseos_attempts: 0, update: async () => {} });
    assert.equal(payload.referralCode, "REFERRAL10");
  } finally {
    globalThis.fetch = fetchBefore;
    if (tokenBefore === undefined) delete process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN;
    else process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN = tokenBefore;
  }
});

test("forwards a standard Namokar referral code to PulseOS", async () => {
  const fetchBefore = globalThis.fetch;
  const tokenBefore = process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN;
  let payload;
  process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN = "test-token";
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("pulseosapi")) payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await deliverNamokarLead({ submission_id: "namokar-standard-referral-smoke", form_id: "namokar-home-popup-v1", name: "Smoke Test", phone: "+919876543210", service: "cataract", referral_code: "NEC10", message: null, page_url: null, pulseos_attempts: 0, sheet_sync_attempts: 0, created_at: new Date(), toJSON: () => ({}), update: async () => {} });
    assert.equal(payload.referralCode, "NEC10");
  } finally {
    globalThis.fetch = fetchBefore;
    if (tokenBefore === undefined) delete process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN;
    else process.env.PULSEOS_NAMOKAR_INTAKE_TOKEN = tokenBefore;
  }
});
