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

let mockMode = "ok"; // ok | timeout | http500 | empty | notIndia
const calls = [];

// Minimal Geoapify /v1/geocode/search?format=json result shapes, keyed by the
// city we expect the resolver to have queried.
const RESULTS = {
  chennai: { city: "Chennai", state: "Tamil Nadu", country: "India", country_code: "in" },
  bengaluru: { city: "Bengaluru", state: "Karnataka", country: "India", country_code: "in" },
  tiruchirappalli: { city: "Tiruchirappalli", state: "Tamil Nadu", country: "India", country_code: "in" },
  velachery: { city: "Chennai", suburb: "Velachery", state: "Tamil Nadu", country: "India", country_code: "in" },
};

globalThis.fetch = async (url) => {
  const u = new URL(url);
  const text = (u.searchParams.get("text") || "").toLowerCase();
  calls.push(text);

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

  const key = Object.keys(RESULTS).find((k) => text.includes(k));
  const result = key ? RESULTS[key] : { city: "Chennai", state: "Tamil Nadu", country_code: "in" };
  return { ok: true, status: 200, json: async () => ({ results: [result] }) };
};

const { resolveLocation, resolveLocationOffline, _clearLocationCache } = await import(
  "../services/locationResolver.js"
);
const { stateForCity } = await import("../utils/locationText.js");

const run = async (input) => {
  _clearLocationCache();
  return resolveLocation(input);
};

// --- happy path ----------------------------------------------------------

let r = await run("Chennai");
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");
assert.equal(r.source, "geoapify");

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

r = await run("Tamil Nadu, Chennai"); // reversed order
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");

r = await run("  chennai  ");
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");

r = await run("Velachery"); // locality -> parent city
assert.equal(r.city, "Chennai");
assert.equal(r.state, "Tamil Nadu");

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
process.env.GEOAPIFY_GEOCODING_ENABLED = "true";

console.log("Careers location resolver checks passed.");
