// Runo Website Form API delivery for Birthwave website/landing-page leads.
// Unit section: mapper, eligibility, config, failure handling (mocked fetch,
// no DB). Integration section: createWebsiteLead() against the local DB with a
// stubbed fetch — proves Runo is additive and never affects DB / Sheet / response.
import assert from "node:assert/strict";
import {
  mapBirthwaveLeadToRunoPayload,
  shouldSendBirthwaveLeadToRuno,
  formatPhoneForRuno,
} from "../modules/integrations/runo/runo.mapper.js";
import { sendBirthwaveLeadToRuno, getRunoBirthwaveConfig } from "../modules/integrations/runo/runo.service.js";

const URL_OK = "https://runo.example.test/api/website-form/abc";
const env = (over = {}) => ({ RUNO_BIRTHWAVE_ENABLED: "true", RUNO_BIRTHWAVE_WEBSITE_FORM_API_URL: URL_OK, ...over });
const lead = (over = {}) => ({
  id: 1, name: "Runo Test", phone: "+919898989898", email: "t@example.test", service: "Pregnancy Care",
  notes: "hello", status: "NEW", source: "website", source_provider: "birthwave_website", ...over,
});
const resp = (status, body = "{}") => ({ status, ok: status >= 200 && status < 300, text: async () => body, headers: { get: () => "application/json" } });
const noSleep = async () => {};
const quiet = (fn) => async (...a) => { const l = console.log, e = console.error; console.log = console.error = () => {}; try { return await fn(...a); } finally { console.log = l; console.error = e; } };
const send = quiet((over) => sendBirthwaveLeadToRuno({ sleep: noSleep, ...over }));

// Mapper: real fields, no fakes, phone format only in the adapter (TEST 10, 11)
let p = mapBirthwaveLeadToRunoPayload(lead(), { message: "hello" });
assert.deepEqual(p, { your_name: "Runo Test", your_email: "t@example.test", your_phone: "9898989898", your_message: "Service: Pregnancy Care\nhello", your_subject: "Birthwave Website Enquiry", custom_status: "New", custom_source: "Website" });
p = mapBirthwaveLeadToRunoPayload(lead({ email: null, notes: null, service: null, source_provider: "birthwave_vbac" }));
assert.equal("your_email" in p, false); assert.equal("your_message" in p, false);
assert.equal(p.custom_source, "Landing Page"); assert.equal(p.your_subject, "Birthwave VBAC Enquiry");
assert.equal(mapBirthwaveLeadToRunoPayload(lead({ source_provider: "birthwave_naturalbirth" })).your_subject, "Birthwave Natural Birth Enquiry");
assert.equal(mapBirthwaveLeadToRunoPayload(lead({ source_provider: "birthwave_normalbirth" })).your_subject, "Birthwave Normal Birth Enquiry");
assert.equal(formatPhoneForRuno("+919898989898", "e164"), "+919898989898");
assert.equal(formatPhoneForRuno("+919898989898", "digits"), "919898989898");

// Eligibility (TEST 1/2/7/8/9)
assert.equal(shouldSendBirthwaveLeadToRuno({ clientKey: "birthwave", source: "website", sourceProvider: "birthwave_website" }), true);
assert.equal(shouldSendBirthwaveLeadToRuno({ clientKey: "birthwave", source: "website", sourceProvider: "birthwave_vbac" }), true);
assert.equal(shouldSendBirthwaveLeadToRuno({ clientKey: "birthwave", source: "instagram", sourceProvider: "REPLI" }), false);
assert.equal(shouldSendBirthwaveLeadToRuno({ clientKey: "birthwave", source: "manual", sourceProvider: null }), false);
assert.equal(shouldSendBirthwaveLeadToRuno({ clientKey: "rio", source: "website", sourceProvider: "birthwave_website" }), false);

// Success posts once with JSON (TEST 1)
let calls = [];
let r = await send({ lead: lead(), env: env(), fetchImpl: async (u, o) => { calls.push({ u, o }); return resp(200); } });
assert.deepEqual([r.attempted, r.success, r.statusCode], [true, true, 200]);
assert.equal(calls.length, 1); assert.equal(calls[0].o.headers["Content-Type"], "application/json");
assert.equal(JSON.parse(calls[0].o.body).custom_source, "Website");

// 400 not retried; 500 retried then fails; never throws; result carries no URL (TEST 3)
calls = []; r = await send({ lead: lead(), env: env(), fetchImpl: async () => { calls.push(1); return resp(400, "bad"); } });
assert.deepEqual([r.success, r.errorCode, calls.length], [false, "RUNO_HTTP_4XX", 1]);
calls = []; r = await send({ lead: lead(), env: env(), fetchImpl: async () => { calls.push(1); return resp(500, "<html>"); } });
assert.deepEqual([r.success, r.errorCode, calls.length], [false, "RUNO_HTTP_5XX", 3]);
assert.equal(JSON.stringify(r).includes("runo.example"), false);
// 500 then 200 recovers
let n = 0; r = await send({ lead: lead(), env: env(), fetchImpl: async () => (++n === 1 ? resp(503) : resp(200)) });
assert.deepEqual([r.success, r.attempts], [true, 2]);

// Timeout / network (TEST 4)
r = await send({ lead: lead(), env: env({ RUNO_BIRTHWAVE_TIMEOUT_MS: "20" }), fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" })))) });
assert.equal(r.errorCode, "RUNO_TIMEOUT");
r = await send({ lead: lead(), env: env(), fetchImpl: async () => { throw new Error("ENOTFOUND"); } });
assert.equal(r.errorCode, "RUNO_NETWORK");

// Disabled / missing URL / insecure URL in production: no outbound request (TEST 5, 6)
const never = async () => { throw new Error("must not be called"); };
r = await send({ lead: lead(), env: env({ RUNO_BIRTHWAVE_ENABLED: "false" }), fetchImpl: never });
assert.deepEqual([r.attempted, r.errorCode], [false, "RUNO_DISABLED"]);
r = await send({ lead: lead(), env: env({ RUNO_BIRTHWAVE_WEBSITE_FORM_API_URL: "" }), fetchImpl: never });
assert.deepEqual([r.attempted, r.errorCode], [false, "RUNO_URL_MISSING"]);
r = await send({ lead: lead(), env: env({ NODE_ENV: "production", RUNO_BIRTHWAVE_WEBSITE_FORM_API_URL: "http://x.test/a" }), fetchImpl: never });
assert.equal(r.errorCode, "RUNO_URL_MISSING");
assert.equal(getRunoBirthwaveConfig({}).enabled, false);

console.log("Runo unit checks passed.");

// ── Integration: createWebsiteLead() + stubbed fetch (TEST 1/2/3/12) ──
const { default: db } = await import("../database/index.js");
const { createWebsiteLead } = await import("../modules/birthwave/birthwaveWebsiteLead.service.js");
let client = null;
try {
  client = await db.Client.findOne({ where: { client_key: "birthwave" }, attributes: ["id"] });
} catch (error) {
  console.log("Local DB unavailable (" + (error?.name || "error") + ") — skipping DB integration section.");
}
if (!client) {
  console.log("No usable local 'birthwave' client — DB integration section NOT run.");
  process.exit(process.exitCode || 0);
}
Object.assign(process.env, env({ NODE_ENV: "development" }));
const realFetch = globalThis.fetch;
const suffix = Date.now();
const created = [];
let runoCalls = [];
let runoStatus = 200;
globalThis.fetch = async (u, o) => {
  if (String(u).startsWith(URL_OK)) { runoCalls.push(JSON.parse(o.body)); return resp(runoStatus); }
  return resp(200, '{"result":"success"}'); // Google Sheet stub
};
const origError = console.error;
const settle = () => new Promise((res) => setTimeout(res, 400));
const phone = (i) => `+9198${String(suffix).slice(-7)}${i}0`;
try {
  const web = await createWebsiteLead(client.id, { source_key: "birthwave_website", external_submission_id: `runo-w-${suffix}`, name: "Runo Web", phone: phone(1), message: "m" }, { skipSheetSync: true, skipRuno: false });
  const land = await createWebsiteLead(client.id, { source_key: "birthwave_vbac", external_submission_id: `runo-l-${suffix}`, name: "Runo Land", phone: phone(2) }, { skipSheetSync: true, skipRuno: false });
  created.push(web, land);
  await settle();
  assert.deepEqual(runoCalls.map((c) => c.custom_source), ["Website", "Landing Page"]);

  // Duplicate submission -> no second Runo call (TEST 12)
  const dup = await createWebsiteLead(client.id, { source_key: "birthwave_website", external_submission_id: `runo-w-${suffix}`, name: "Runo Web", phone: phone(1) }, { skipSheetSync: true, skipRuno: false });
  assert.equal(dup.duplicate, true); await settle(); assert.equal(runoCalls.length, 2);

  // Runo 500: lead + response unaffected, sheet path still runs (TEST 3)
  runoStatus = 500; runoCalls = [];
  const l = console.error; console.error = () => {};
  const failing = await createWebsiteLead(client.id, { source_key: "birthwave_website", external_submission_id: `runo-f-${suffix}`, name: "Runo Fail", phone: phone(3) }, { skipRuno: false });
  await settle(); console.error = l;
  created.push(failing);
  assert.equal(failing.duplicate, false); assert.ok(failing.birthwave_lead_id);
  assert.equal((await db.BirthwaveLead.findByPk(failing.birthwave_lead_id)).name, "Runo Fail");
  assert.equal((await db.BirthwaveWebsiteLead.findByPk(failing.id)).sheet_sync_status, "synced");

  // Default (seed/test style) callers never reach Runo
  runoCalls = [];
  const skipped = await createWebsiteLead(client.id, { source_key: "birthwave_website", external_submission_id: `runo-s-${suffix}`, name: "Runo Skip", phone: phone(4) }, { skipSheetSync: true });
  created.push(skipped); await settle(); assert.equal(runoCalls.length, 0);
  console.log("Runo integration checks passed.");
} catch (error) {
  console.error = origError;
  console.error("Runo integration check FAILED:", error);
  process.exitCode = 1;
} finally {
  console.error = origError;
  globalThis.fetch = realFetch;
  for (const c of created) {
    if (c.birthwave_lead_id) {
      await db.BirthwaveLeadActivity.destroy({ where: { lead_id: c.birthwave_lead_id } });
      await db.BirthwaveTask?.destroy({ where: { lead_id: c.birthwave_lead_id } });
      await db.BirthwaveLead.destroy({ where: { id: c.birthwave_lead_id } });
    }
    await db.BirthwaveWebsiteLead.destroy({ where: { id: c.id } });
  }
  process.exit(0);
}
