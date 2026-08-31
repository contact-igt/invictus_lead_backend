import { fn, col, Op } from "sequelize";
import { normalizeLocationValue } from "./locationText.js";

const NON_EMPTY = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] };

/**
 * Shared logic for building admin filter option lists (State / City) from
 * applicant-style tables.
 *
 * The DB does the heavy lifting with a single GROUP BY; the pure
 * `assembleLocationFilters` function turns those grouped rows into the
 * parent/dependent option lists and is unit-tested in isolation.
 */

const toSortedOptions = (countByName) =>
  [...countByName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * @param {Array<{ state: string|null, city: string|null, count: number|string }>} pairs
 *        Grouped (state, city, count) rows.
 * @param {{ state?: string }} [opts] When `state` is set, cities are limited to that state.
 * @returns {{ states: Array<{name,count}>, cities: Array<{name,count}> }}
 */
export const assembleLocationFilters = (pairs, opts = {}) => {
  const wantState = normalizeLocationValue(opts.state);

  const stateCounts = new Map();
  const cityCounts = new Map();

  for (const row of pairs) {
    const state = normalizeLocationValue(row.state);
    const city = normalizeLocationValue(row.city);
    const count = Number(row.count) || 0;

    if (state) {
      stateCounts.set(state, (stateCounts.get(state) || 0) + count);
    }
    if (city && (!wantState || state === wantState)) {
      cityCounts.set(city, (cityCounts.get(city) || 0) + count);
    }
  }

  return {
    states: toSortedOptions(stateCounts),
    cities: toSortedOptions(cityCounts),
  };
};

/** Collapse grouped rows for a single column into sorted `{name,count}` options. */
export const assembleColumnOptions = (rows, key, normalize = false) => {
  const counts = new Map();
  for (const row of rows) {
    const name = normalize
      ? normalizeLocationValue(row[key])
      : String(row[key] ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + (Number(row.count) || 0));
  }
  return toSortedOptions(counts);
};

/**
 * Run the grouped (state, city) query for a model.
 * `cityColumn` is the physical column name that holds the city value.
 * Kept for callers/tests that need every pair at once.
 */
export const queryStateCityPairs = (model, cityColumn) =>
  model.findAll({
    attributes: [
      "state",
      [col(cityColumn), "city"],
      [fn("COUNT", col("id")), "count"],
    ],
    group: ["state", cityColumn],
    raw: true,
  });

/** Run a grouped count query for a single column (role, status, ...). */
export const queryColumnCounts = (model, column) =>
  model.findAll({
    attributes: [column, [fn("COUNT", col("id")), "count"]],
    group: [column],
    raw: true,
  });

/** Distinct non-empty `state` values with per-state application counts. */
export const queryDistinctStateCounts = (model, extraWhere = {}) =>
  model.findAll({
    attributes: ["state", [fn("COUNT", col("id")), "count"]],
    where: { state: NON_EMPTY, ...extraWhere },
    group: ["state"],
    order: [["state", "ASC"]],
    raw: true,
  });

/**
 * Distinct non-empty city values (with counts).
 * Pass `state` to scope to one state; omit it for the full city list.
 */
export const queryCityCounts = (model, cityColumn, state, extraWhere = {}) =>
  model.findAll({
    attributes: [[col(cityColumn), "city"], [fn("COUNT", col("id")), "count"]],
    where: {
      [cityColumn]: NON_EMPTY,
      ...(state ? { state } : {}),
      ...extraWhere,
    },
    group: [cityColumn],
    order: [[col(cityColumn), "ASC"]],
    raw: true,
  });

/**
 * Assemble the careers `/filters` response from already-fetched grouped rows.
 * Pure — unit-tested.
 *
 * City list:
 *   - no state selected  -> the full distinct city list (admin can filter by
 *     city directly)
 *   - state selected     -> only that state's cities (dependent narrowing)
 * `cityRows` should already reflect that scoping (the caller runs the right query).
 */
export const buildCareersFilterResult = ({ state, stateRows, cityRows, roleRows, statusRows } = {}) => {
  const normalizedState = normalizeLocationValue(state);
  return {
    state: normalizedState || null,
    states: assembleColumnOptions(stateRows || [], "state", true),
    cities: assembleColumnOptions(cityRows || [], "city", true),
    roles: assembleColumnOptions(roleRows || [], "role"),
    statuses: assembleColumnOptions(statusRows || [], "status"),
  };
};
