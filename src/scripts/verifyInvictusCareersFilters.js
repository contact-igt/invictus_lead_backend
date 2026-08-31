/**
 * Unit checks for the careers filter-option pipeline:
 *  - location value normalization / rejection
 *  - state + city option generation with counts
 *  - dependent city filtering (city list restricted to selected state)
 *
 * Pure functions only — no DB connection required.
 */
import assert from "node:assert/strict";
import { normalizeLocationValue, isValidLocationValue } from "../utils/locationText.js";
import {
  assembleLocationFilters,
  assembleColumnOptions,
  buildCareersFilterResult,
  queryDistinctStateCounts,
  queryCityCounts,
} from "../utils/filterOptions.js";

// --- normalization -----------------------------------------------------------

assert.equal(normalizeLocationValue("  navi   mumbai "), "Navi Mumbai");
assert.equal(normalizeLocationValue("BENGALURU"), "Bengaluru");
assert.equal(normalizeLocationValue("new-delhi"), "New-Delhi");
assert.equal(normalizeLocationValue("tamil nadu"), "Tamil Nadu");
assert.equal(normalizeLocationValue("சென்னை"), "சென்னை", "Unicode city names are accepted");

for (const junk of ["", "   ", "-", "n/a", "N/A", "none", "NULL", "city", "State", "123", "--"]) {
  assert.equal(normalizeLocationValue(junk), "", `expected "${junk}" to normalize to ""`);
  assert.equal(isValidLocationValue(junk), false);
}
assert.equal(isValidLocationValue("Pune"), true);

// --- option generation + counts --------------------------------------------

const pairs = [
  { state: "Karnataka", city: "Bengaluru", count: 5 },
  { state: "karnataka", city: "  bengaluru ", count: 2 }, // merges after normalization
  { state: "Karnataka", city: "Mysuru", count: 1 },
  { state: "Maharashtra", city: "Pune", count: 4 },
  { state: "Maharashtra", city: "Mumbai", count: 3 },
  { state: "", city: "Ghost Town", count: 9 }, // no state -> excluded from states; shown only in the unfiltered city list
  { state: "Gujarat", city: "city", count: 6 }, // junk city rejected
];

const all = assembleLocationFilters(pairs);
assert.deepEqual(
  all.states,
  [
    { name: "Gujarat", count: 6 },
    { name: "Karnataka", count: 8 },
    { name: "Maharashtra", count: 7 },
  ],
  "states aggregated + sorted with counts",
);
assert.deepEqual(
  all.cities.find((c) => c.name === "Bengaluru"),
  { name: "Bengaluru", count: 7 },
  "city counts merge across casing/whitespace",
);
assert.ok(all.cities.some((c) => c.name === "Ghost Town"), "stateless city shown in unfiltered list");
assert.ok(!all.cities.some((c) => c.name.toLowerCase() === "city"), "junk city excluded");

// --- dependent city filtering ---------------------------------------------

const forKarnataka = assembleLocationFilters(pairs, { state: "Karnataka" });
assert.deepEqual(
  forKarnataka.cities.map((c) => c.name),
  ["Bengaluru", "Mysuru"],
  "city list restricted to selected state (stateless cities dropped)",
);
assert.equal(forKarnataka.states.length, 3, "state list is unaffected by the state filter");

const forCasing = assembleLocationFilters(pairs, { state: "  karnataka " });
assert.deepEqual(forCasing.cities.map((c) => c.name), ["Bengaluru", "Mysuru"], "state filter is normalized");

// --- single-column options ----------------------------------------------

const roleRows = [
  { role: "Video Editor", count: 3 },
  { role: "Graphic Designer", count: 5 },
  { role: "", count: 2 },
];
assert.deepEqual(assembleColumnOptions(roleRows, "role"), [
  { name: "Graphic Designer", count: 5 },
  { name: "Video Editor", count: 3 },
]);

// --- /filters response assembly --------------------------------------------
// The caller picks the right city query; buildCareersFilterResult just shapes
// whatever cityRows it is handed. State list is never affected by the state arg.

const fStateRows = [
  { state: "Tamil Nadu", count: 12 },
  { state: "Karnataka", count: 5 },
];
const fRoleRows = [{ role: "Video Editor", count: 3 }];
const fStatusRows = [{ status: "New", count: 8 }];
const allCityRows = [
  { city: "Chennai", count: 9 },
  { city: "Coimbatore", count: 3 },
  { city: "Bengaluru", count: 5 },
  { city: "30000", count: 1 },
  { city: "600000", count: 1 },
];
const tnCityRows = [
  { city: "Chennai", count: 9 },
  { city: "Coimbatore", count: 3 },
];

const noState = buildCareersFilterResult({ state: "", stateRows: fStateRows, cityRows: allCityRows, roleRows: fRoleRows, statusRows: fStatusRows });
assert.deepEqual(noState.cities.map((c) => c.name), ["Bengaluru", "Chennai", "Coimbatore"], "no state => full city list");
assert.ok(!noState.cities.some((c) => ["30000", "600000"].includes(c.name)), "numeric-only cities excluded");
assert.equal(noState.state, null);
assert.equal(noState.states.length, 2, "states always returned");
assert.equal(noState.roles.length, 1);

const withState = buildCareersFilterResult({ state: "  tamil nadu ", stateRows: fStateRows, cityRows: tnCityRows, roleRows: fRoleRows, statusRows: fStatusRows });
assert.equal(withState.state, "Tamil Nadu", "state echoed back normalized");
assert.deepEqual(withState.cities.map((c) => c.name), ["Chennai", "Coimbatore"], "cities scoped to the selected state");
assert.deepEqual(withState.cities.find((c) => c.name === "Chennai"), { name: "Chennai", count: 9 });
assert.equal(withState.states.length, 2, "state list unaffected by the state filter");

// --- verified-only database queries ----------------------------------------

const queryModel = { findAll: async (options) => options };
const stateQuery = await queryDistinctStateCounts(queryModel, { location_verified: true });
assert.equal(stateQuery.where.location_verified, true, "state options query only verified locations");

const cityQuery = await queryCityCounts(queryModel, "current_city", "Tamil Nadu", { location_verified: true });
assert.equal(cityQuery.where.location_verified, true, "city options query only verified locations");
assert.equal(cityQuery.where.state, "Tamil Nadu");

console.log("Invictus careers filter-option checks passed.");
