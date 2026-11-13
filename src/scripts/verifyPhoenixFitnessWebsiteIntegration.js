import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import db from "../database/index.js";
import { phoenixWebsiteSchema } from "../modules/phoenixFitness/phoenixFitnessWebsite.validation.js";
import { createPhoenixFitnessWebsiteLead } from "../modules/phoenixFitness/phoenixFitnessWebsite.service.js";
import { mapPhoenixLeadToRunoPayload, sendPhoenixLeadToRuno, attemptPhoenixFitnessRunoSync, getPhoenixRunoConfig } from "../modules/phoenixFitness/phoenixFitnessRuno.service.js";
import { WEBSITE_SHEET_URL, attemptPhoenixFitnessSheetSync, sendPhoenixFitnessSheetRecord, retryPendingPhoenixFitnessSheetSyncs } from "../modules/phoenixFitness/phoenixFitnessSheetSync.service.js";

const env = { RUNO_PHOENIX_ENABLED: "true", RUNO_PHOENIX_WEBSITE_FORM_API_URL: "https://runo.example.test/phoenix" };
const response = (status, body = { success: true }) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, text: async () => JSON.stringify(body) });
const trial = { formType: "Free Trial", requestId: randomUUID(), data: { name: "Phoenix Test", phone: "9876543210", branch: "Hope Farm", time: "Morning", goal: "Strength" } };
const contact = { formType: "Contact Message", requestId: randomUUID(), data: { name: "Test", mobile: "+919876543210", email: "test@example.com", service: "Training", subject: "Enquiry" } };
const franchise = { formType: "Franchise Enquiry", requestId: randomUUID(), data: { name: "Test", phone: "9876543210", email: "test@example.com", city: "Bengaluru", state: "Karnataka", locality: "Whitefield", propertyStatus: "Owned", investmentBudget: "50 lakh", timeline: "3 months", consent: "Yes", message: "Franchise test" } };
for (const body of [trial, contact, franchise]) assert.equal(phoenixWebsiteSchema.validate(body).error, undefined);
for (const body of [null, {}, { ...trial, formType: "Invalid" }, { ...trial, requestId: "bad" }, { ...trial, data: [] }, { ...trial, data: { ...trial.data, phone: "---" } }, { ...franchise, data: { ...franchise.data, consent: "No" } }, { ...contact, data: { ...contact.data, email: "bad" } }]) assert.ok(phoenixWebsiteSchema.validate(body).error);

const oldFindOrCreate = db.PhoenixFitness.findOrCreate;
const oldUpdate = db.PhoenixFitness.update;
const oldFindAll = db.PhoenixFitness.findAll;
const oldFetch = globalThis.fetch;
const oldClientFindOne = db.Client.findOne;
const oldEnabled = process.env.RUNO_PHOENIX_ENABLED;
const oldConsole = console.error;
console.error = () => {};
process.env.RUNO_PHOENIX_ENABLED = "false";
let lead;
try {
  const rows = new Map();
  db.PhoenixFitness.findOrCreate = async ({ where, defaults }) => {
    const key = `${where.client_id}:${where.website_request_id}`;
    if (rows.has(key)) return [rows.get(key), false];
    const row = { ...defaults, id: rows.size + 1, created_at: new Date(), sheet_sync_attempts: 0, runo_sync_attempts: 0,
      async update(values) { Object.assign(this, values); return this; } };
    rows.set(key, row); return [row, true];
  };
  const result = await createPhoenixFitnessWebsiteLead(trial, 1, { skipDelivery: true });
  assert.equal(result.duplicate, false);
  assert.equal((await createPhoenixFitnessWebsiteLead(trial, 1, { skipDelivery: true })).duplicate, true);
  assert.equal((await createPhoenixFitnessWebsiteLead(trial, 2, { skipDelivery: true })).duplicate, false);
  await createPhoenixFitnessWebsiteLead(contact, 1, { skipDelivery: true });
  await createPhoenixFitnessWebsiteLead(franchise, 1, { skipDelivery: true });
  lead = rows.get(`1:${trial.requestId}`);
  assert.deepEqual(lead.website_data, trial.data);
  assert.equal(rows.get(`1:${contact.requestId}`).mobile_number, contact.data.mobile);
  assert.deepEqual(rows.get(`1:${franchise.requestId}`).website_data, franchise.data);

  db.PhoenixFitness.update = async () => [1];
  let sheetCalls = 0;
  globalThis.fetch = async (url, options) => {
    sheetCalls++;
    assert.equal(url, WEBSITE_SHEET_URL);
    const payload = JSON.parse(options.body);
    assert.equal(payload.formType, "Free Trial"); assert.equal(payload.time, "Morning"); assert.equal(payload.goal, "Strength");
    assert.equal(payload.requestId, trial.requestId);
    return response(200);
  };
  assert.equal(await attemptPhoenixFitnessSheetSync(lead), true);
  assert.equal(sheetCalls, 1); assert.equal(lead.sheet_sync_status, "synced");
  assert.equal(lead.runo_sync_status, "pending");
  assert.equal(await attemptPhoenixFitnessSheetSync(lead, { fetchImpl: async () => response(503) }), false);
  assert.equal(lead.sheet_sync_status, "failed");
  for (const body of ["<html>login</html>", "", '{"success":false}']) {
    await assert.rejects(sendPhoenixFitnessSheetRecord(lead, { fetchImpl: async () => ({ ok: true, text: async () => body }) }));
  }
  let claimed = 0;
  db.PhoenixFitness.update = async () => { claimed++; return [1]; };
  assert.equal(await attemptPhoenixFitnessRunoSync(lead, { env }), false);
  assert.equal(claimed, 0); // A failed Sheet never triggers Runo.

  const payload = mapPhoenixLeadToRunoPayload(rows.get(`1:${franchise.requestId}`));
  assert.equal(payload.your_phone, "9876543210"); assert.equal(payload.your_city, "Bengaluru");
  assert.equal(payload.your_subject, "Phoenix Fitness Franchise Enquiry");
  assert.ok(payload.your_message.includes("investmentBudget: 50 lakh"));
  assert.equal(payload.custom_source, "Website"); assert.equal("custom_status" in payload, false);
  assert.equal(getPhoenixRunoConfig({}).enabled, false);
  assert.equal(getPhoenixRunoConfig({}).timeoutMs, 8000);
  assert.equal(getPhoenixRunoConfig({ ...env, RUNO_PHOENIX_WEBSITE_FORM_API_URL: "http://insecure.test" }).valid, false);
  let calls = 0;
  const send = (options = {}) => sendPhoenixLeadToRuno({ lead, env, timeoutMs: 20, sleep: async () => {}, ...options });
  let r = await send({ fetchImpl: async (url, options) => { calls++; assert.equal(url, env.RUNO_PHOENIX_WEBSITE_FORM_API_URL); assert.equal(JSON.parse(options.body).your_subject, "Phoenix Fitness Free Trial"); return response(200); } });
  assert.equal(r.success, true); assert.equal(calls, 1);
  calls = 0; r = await send({ fetchImpl: async () => { calls++; return response(400); } });
  assert.equal(r.retryable, false); assert.equal(calls, 1);
  calls = 0; r = await send({ fetchImpl: async () => { calls++; return response(503); } });
  assert.equal(r.success, false); assert.equal(calls, 3);
  calls = 0; r = await send({ fetchImpl: async () => response(++calls === 1 ? 503 : 200) });
  assert.equal(r.success, true); assert.equal(r.attempts, 2);
  r = await send({ fetchImpl: async () => response(200, { success: false }) });
  assert.equal(r.errorCode, "RUNO_REJECTED");
  r = await send({ fetchImpl: async () => { throw new Error("secret URL must not be returned"); } });
  assert.equal(r.errorCode, "RUNO_NETWORK"); assert.equal(JSON.stringify(r).includes("secret"), false);
  r = await send({ fetchImpl: async (_url, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error(), { name: "AbortError" })))) });
  assert.equal(r.errorCode, "RUNO_TIMEOUT");
  r = await send({ env: {}, fetchImpl: async () => assert.fail("disabled Runo called") });
  assert.equal(r.attempted, false);

  lead.sheet_sync_status = "synced";
  r = await attemptPhoenixFitnessRunoSync(lead, { env, fetchImpl: async () => response(200) });
  assert.equal(r, true); assert.equal(lead.runo_sync_status, "synced");
  db.PhoenixFitness.update = async () => [0];
  assert.equal(await attemptPhoenixFitnessRunoSync(lead, { env, fetchImpl: async () => assert.fail("already claimed row sent") }), false);
  db.PhoenixFitness.update = async () => [1];
  assert.equal(await attemptPhoenixFitnessRunoSync(lead, { env, fetchImpl: async () => response(400) }), false);
  assert.equal(lead.runo_sync_status, "rejected");
  assert.equal(lead.runo_sync_next_attempt_at, null);

  // End-to-end ordering through the real public service and Sheet hook, without network/DB.
  const order = [];
  process.env.RUNO_PHOENIX_ENABLED = "true";
  const oldUrl = process.env.RUNO_PHOENIX_WEBSITE_FORM_API_URL;
  process.env.RUNO_PHOENIX_WEBSITE_FORM_API_URL = env.RUNO_PHOENIX_WEBSITE_FORM_API_URL;
  db.PhoenixFitness.findOrCreate = async ({ defaults }) => {
    order.push("db");
    const row = { ...defaults, id: 99, created_at: new Date(), async update(values) { Object.assign(this, values); if (values.runo_sync_status === "synced") order.push("runo-synced"); return this; } };
    return [row, true];
  };
  globalThis.fetch = async (url) => { order.push(url === WEBSITE_SHEET_URL ? "sheet" : "runo"); return response(200); };
  await createPhoenixFitnessWebsiteLead({ ...trial, requestId: randomUUID() }, 1);
  for (let i = 0; i < 20 && !order.includes("runo-synced"); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["db", "sheet", "runo", "runo-synced"]);
  if (oldUrl === undefined) delete process.env.RUNO_PHOENIX_WEBSITE_FORM_API_URL; else process.env.RUNO_PHOENIX_WEBSITE_FORM_API_URL = oldUrl;
  // Exercise the real public HTTP route, tenant guard and validation using mocked storage.
  const { default: express } = await import("express");
  const { default: router } = await import("../modules/phoenixFitness/phoenixFitness.routes.js");
  const app = express(); app.use(express.json()); app.use("/phoenix", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    db.Client.findOne = async () => ({ id: 7, name: "Phoenix" });
    let storageCalls = 0;
    db.PhoenixFitness.findOrCreate = async ({ where, defaults }) => {
      storageCalls++; assert.equal(where.client_id, 7);
      return [{ ...defaults, id: 77 }, false]; // Existing UUID must not retrigger delivery.
    };
    const url = "http://127.0.0.1:" + server.address().port + "/phoenix/website/register";
    const post = (body, key) => oldFetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "X-Client-Key": key } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post(trial)).status, 401);
    assert.equal((await post(trial, "birthwave")).status, 401);
    assert.equal(storageCalls, 0);
    assert.equal((await post({ ...trial, data: null }, "phoenix_fitness")).status, 400);
    assert.equal((await post(undefined, "phoenix_fitness")).status, 400);
    for (const body of [trial, contact, franchise]) {
      const response = await post(body, "phoenix_fitness");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, id: 77, duplicate: true });
    }
    assert.equal(storageCalls, 3);
  } finally { await new Promise((resolve) => server.close(resolve)); }
  console.log("Phoenix website HTTP intake, tenant isolation, validation, persistence, deduplication, Sheets -> Runo ordering, retries and failure checks passed (mocked DB/remote services).");
} finally {
  db.PhoenixFitness.findOrCreate = oldFindOrCreate; db.PhoenixFitness.update = oldUpdate; db.PhoenixFitness.findAll = oldFindAll;
  globalThis.fetch = oldFetch; db.Client.findOne = oldClientFindOne; console.error = oldConsole;
  if (oldEnabled === undefined) delete process.env.RUNO_PHOENIX_ENABLED; else process.env.RUNO_PHOENIX_ENABLED = oldEnabled;
  await db.sequelize.close();
}
