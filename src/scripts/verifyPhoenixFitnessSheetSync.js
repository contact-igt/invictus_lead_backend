import assert from "node:assert/strict";
import { buildPhoenixFitnessSheetPayload, sendPhoenixFitnessSheetRecord } from "../modules/phoenixFitness/phoenixFitnessSheetSync.service.js";
const lead = { name: "Phoenix Test", mobile_number: "+91 9876543210", branch: "Hope Farm", ip_address: "127.0.0.1", utm_source: "google" };
assert.deepEqual(buildPhoenixFitnessSheetPayload(lead), { name: "Phoenix Test", phone: "919876543210", branch: "Hope Farm", ip_address: "127.0.0.1", utm_source: "google" });
let request;
await sendPhoenixFitnessSheetRecord(lead, { fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 200, text: async () => JSON.stringify({ result: "success" }) }; } });
assert.equal(request.url, "https://script.google.com/macros/s/AKfycby1WuPwU5mCSNcDMFmPBjttJuJlnNrCof0iPsq2u8DtRZVG9RKjB5wuMpjLJmyf4Qql/exec");
assert.equal(request.options.body, "name=Phoenix+Test&phone=919876543210&branch=Hope+Farm&ip_address=127.0.0.1&utm_source=google");
console.log("Phoenix Fitness Sheet sync verification passed.");
