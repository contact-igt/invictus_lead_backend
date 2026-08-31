/**
 * Unit checks for the careers location resolver.
 *
 * Geoapify is fully mocked — these tests never touch the network, a real API
 * key, or Geoapify quota. Run:  npm run test:careers-resolver
 */
import assert from "node:assert/strict";

// --- Geoapify mock ---------------------------------------------------------
// The resolver module reads the config at import time, so set env BEFORE importing.
process.env.GEOAPIFY_API_KEY = "test-key-not-real";
process.env.GEOAPIFY_GEOCODING_ENABLED = "true";

let mockMode = "ok"; // ok | timeout | http500 | empty | notIndia | lowConfidence
const calls = [];
const requestedTypes = [];

// Minimal Geoapify /v1/geocode/search?format=json result shapes, keyed by the
// city we expect the resolver to have queried.
const RESULTS = {
  chennai: { city: "Chennai", state: "Tamil Nadu", country: "India", country_code: "in", result_type: "city", rank: { confidence_city_level: 1 } },
  bengaluru: { city: "Bengaluru", state: "Karnataka", country: "India", country_code: "in", result_type: "city", rank: { confidence_city_level: 1 } },
  tiruchirappalli: { city: "Tiruchirappalli", state: "Tamil Nadu", country: "India", country_code: "in", result_type: "city", rank: { confidence_city_level: 1 } },
  velachery: { city: "Chennai", suburb: "Velachery", state: "Tamil Nadu", country: "India", country_code: "in", result_type: "city", rank: { confidence_city_level: 1 } },
};

globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.hostname !== "api.geoapify.com") {
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  }
  const text = (u.searchParams.get("text") || "").toLowerCase();
  calls.push(text);
  requestedTypes.push(u.searchParams.get("type"));

  if (mockMode === "timeout") {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    throw e;
  }
  if (mockMode === "http500") {
    return { ok: false, status: 500, json: async () => ({}) };
  }
  if (mockMode === "empty") {
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  }
  if (mockMode === "notIndia") {
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: [{ city: "London", state: "England", country_code: "gb" }] }),
    };
  }
  if (mockMode === "lowConfidence") {
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: [{ city: "Asdfgh", state: "Tamil Nadu", country_code: "in", result_type: "city", rank: { confidence_city_level: 0.1 } }] }),
    };
  }

  const key = Object.keys(RESULTS).find((k) => text.includes(k));
  const result = key ? RESULTS[key] : RESULTS.chennai;
  return { ok: true, status: 200, json: async () => ({ results: [result] }) };
};

const { resolveLocation, resolveLocationOffline, _clearLocationCache } = await import(
  "../services/locationResolver.js"
);
const { stateForCity } = await import("../utils/locationText.js");

const run = async (input, state) => {
  _clearLocationCache();
  return resolveLocation(input, state);
};

// --- happy path ----------------------------------------------------------

let r = await run("Chennai");
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");
assert.equal(r.source, "geoapify");
assert.equal(r.verified, true);
assert.equal(requestedTypes.at(-1), "city", "Geoapify query is restricted to city-level results");
const callsAfterVerified = calls.length;
await resolveLocation("Chennai");
assert.equal(calls.length, callsAfterVerified, "verified result is cached");

r = await run("Bangalore"); // alias -> Bengaluru before the API call
assert.equal(r.city, "Bengaluru");
assert.equal(r.state, "Karnataka");
assert.ok(calls.at(-1).includes("bengaluru"), "alias applied before geocoding");

r = await run("Trichy");
assert.equal(r.city, "Tiruchirappalli");
assert.equal(r.state, "Tamil Nadu");

r = await run("Bengaluru"); // already canonical
assert.equal(r.city, "Bengaluru");
assert.equal(r.state, "Karnataka");

r = await run("Chennai, Tamil Nadu");
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");

r = await run("Chennai", "Tamil Nadu");
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");
assert.ok(calls.at(-1).includes("chennai, tamil nadu"), "separate state included in geocoding query");

r = await run("Tamil Nadu, Chennai"); // reversed order
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");

r = await run("  chennai  ");
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");

r = await run("Velachery"); // locality -> parent city
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");

const callsBeforeInvalid = calls.length;
r = await run("600000", "Tamil Nadu");
assert.equal(r.city, "");
assert.equal(r.state, null);
assert.equal(r.verified, false);
assert.equal(calls.length, callsBeforeInvalid, "numeric-only city rejected before geocoding");

// --- graceful fallback --------------------------------------------------

mockMode = "timeout";
r = await run("Some New City");
assert.equal(r.source, "fallback");
assert.equal(r.city, "Some New City");
assert.equal(r.state, null, "timeout => state null, creation still succeeds");

mockMode = "http500";
r = await run("Another Town");
assert.equal(r.source, "fallback");
assert.equal(r.city, "Another Town");

mockMode = "empty";
r = await run("Nowhere Ville");
assert.equal(r.source, "fallback");
assert.equal(r.city, "Nowhere Ville");

mockMode = "notIndia";
r = await run("London");
assert.equal(r.source, "fallback", "non-India result rejected");
assert.equal(r.state, null);
assert.equal(r.verified, false);

mockMode = "lowConfidence";
r = await run("Asdfgh", "Tamil Nadu");
assert.equal(r.source, "fallback", "low-confidence city result rejected");
assert.equal(r.city, "Asdfgh");
assert.equal(r.verified, false);
const callsAfterUnverified = calls.length;
await resolveLocation("Asdfgh", "Tamil Nadu");
assert.equal(calls.length, callsAfterUnverified + 1, "unverified result is retried instead of cached");

// comma fallback still extracts the state without the API
mockMode = "timeout";
r = await run("Kumbakonam, Tamil Nadu");
assert.equal(r.city, "Kumbakonam");
assert.equal(r.state, "Tamil Nadu", "state parsed from comma input even when geocoding is down");

// --- feature disabled --------------------------------------------------

mockMode = "ok";
process.env.GEOAPIFY_GEOCODING_ENABLED = "false";
const callsBefore = calls.length;
r = await run("Madurai");
assert.equal(calls.length, callsBefore, "geocoding disabled => no fetch call");
assert.equal(r.source, "fallback");
assert.equal(r.city, "Madurai");
process.env.GEOAPIFY_GEOCODING_ENABLED = "true";

// --- no API key -------------------------------------------------------

delete process.env.GEOAPIFY_API_KEY;
const callsBefore2 = calls.length;
r = await run("Salem");
assert.equal(calls.length, callsBefore2, "missing API key => no fetch call");
assert.equal(r.source, "fallback");
assert.equal(r.city, "Salem");
assert.equal(r.state, "Tamil Nadu", "no key: known city still resolves state from the map");

r = await run("Someunknownplace"); // not in the city→state map
assert.equal(r.source, "fallback");
assert.equal(r.city, "Someunknownplace");
assert.equal(r.state, null, "no key + unknown city => state null, creation still succeeds");
assert.equal(r.verified, false, "unknown fallback is not eligible for filters");
process.env.GEOAPIFY_API_KEY = "test-key-not-real";

// --- deterministic city -> state map (no network) ------------------------

assert.equal(stateForCity("Chennai"), "Tamil Nadu");
assert.equal(stateForCity("  bangalore "), "Karnataka", "alias + map");
assert.equal(stateForCity("Kochi"), "Kerala");
assert.equal(stateForCity("Trichy"), "Tamil Nadu");
assert.equal(stateForCity("Vadapalani"), "Tamil Nadu", "locality -> parent city -> state");
assert.equal(stateForCity("Nowhere"), "");

// resolveLocationOffline: used by the backfill — never touches fetch
const offBefore = calls.length;
let o = resolveLocationOffline("Coimbatore");
assert.equal(o.city, "Coimbatore");
assert.equal(o.state, "Tamil Nadu");
assert.equal(o.source, "fallback");
assert.equal(o.verified, true);

o = resolveLocationOffline("Erode, Tamilnadu");
assert.equal(o.city, "Erode");
assert.equal(o.state, "Tamil Nadu");

o = resolveLocationOffline("city"); // junk
assert.equal(o.city, "");
assert.equal(o.state, null);

o = resolveLocationOffline("Bangalore");
assert.equal(o.city, "Bengaluru");
assert.equal(o.state, "Karnataka");
assert.equal(calls.length, offBefore, "resolveLocationOffline never calls fetch");

// Geoapify disabled but city is known -> state still inferred
process.env.GEOAPIFY_GEOCODING_ENABLED = "false";
r = await run("Madurai");
assert.equal(r.source, "fallback");
assert.equal(r.state, "Tamil Nadu", "known city => state inferred even with geocoding off");
assert.equal(r.verified, true, "known offline city is verified");

r = await run("Chennai", "Karnataka");
assert.equal(r.state, "Tamil Nadu", "offline city map wins over a mismatched submitted state");
assert.equal(r.verified, true);
process.env.GEOAPIFY_GEOCODING_ENABLED = "true";

// --- create persistence + state-only update -------------------------------

const db = (await import("../database/index.js")).default;
const { createCareersApplicationPublic, updateCareersApplication } = await import(
  "../modules/invictusEnquiry/invictusEnquiry.service.js"
);
const createdRows = [];
db.InvictusCareersApplication.findOne = async () => null;
db.InvictusCareersApplication.create = async (values) => {
  const row = {
    ...values,
    id: `test-${createdRows.length}`,
    createdAt: new Date(),
    sheet_sync_attempts: 0,
    update: async function update(patch) { Object.assign(this, patch); },
  };
  createdRows.push(row);
  return row;
};

const validPayload = {
  role: "Video Editor",
  full_name: "Test User",
  phone: "9876543210",
  email: "test@example.com",
  notice_period: "Immediate",
  experience: "1_to_2_years",
  portfolio_or_showreel: "https://example.com",
  tools: ["Premiere Pro"],
  work_categories: ["Editing"],
  workflow_answer: "A valid workflow",
  ai_usage: "ai_selective",
  judgement_answer: "x".repeat(120),
};

mockMode = "ok";
_clearLocationCache();
await createCareersApplicationPublic({ ...validPayload, current_city: "bangalore", state: "karnataka" });
assert.equal(createdRows[0].current_city, "Bengaluru");
assert.equal(createdRows[0].state, "Karnataka");
assert.equal(createdRows[0].location_verified, true, "verified Geoapify result persisted");

mockMode = "lowConfidence";
_clearLocationCache();
await createCareersApplicationPublic({ ...validPayload, current_city: "Asdfgh", state: "Tamil Nadu" });
assert.equal(createdRows[1].location_verified, false, "unverified fallback persisted but excluded from filters");

mockMode = "ok";
_clearLocationCache();
const existing = {
  id: "update-test",
  current_city: "Chennai",
  state: "Karnataka",
  location_verified: false,
  save: async () => {},
};
db.InvictusCareersApplication.findByPk = async () => existing;
await updateCareersApplication(existing.id, { state: "Tamil Nadu" });
assert.equal(existing.state, "Tamil Nadu", "state-only update re-resolves location");
assert.equal(existing.location_verified, true);
const callsBeforeUnchangedUpdate = calls.length;
await updateCareersApplication(existing.id, { current_city: "Chennai", state: "Tamil Nadu" });
assert.equal(calls.length, callsBeforeUnchangedUpdate, "unchanged location does not trigger geocoding");

console.log("Careers location resolver checks passed.");
