/**
 * Careers location resolver.
 *
 * Turns a single free-text location value (city / locality / "City, State")
 * from the public careers form into a canonical `{ city, state }` pair.
 *
 * Order of resolution:
 *   1. normalize + alias canonicalization  (src/utils/locationText.js)
 *   2. "City, State" comma parsing
 *   3. Geoapify forward geocoding (India-only)  — backend only, best effort
 *   4. graceful fallback to the normalized value with state = null
 *
 * A geocoding outage, missing API key, timeout or junk response must NEVER
 * prevent an application from being created — every path returns a usable
 * object. Results are cached in-process for a day (city↔state mapping is stable).
 */
import { getGeoapifyConfig } from "../config/geoapify.config.js";
import { TtlCache } from "../utils/ttlCache.js";
import {
  normalizeLocationValue,
  canonicalizeCity,
  canonicalizeState,
  stateForCity,
} from "../utils/locationText.js";

const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const locationCache = new TtlCache(LOCATION_CACHE_TTL_MS);

/** Test seam — lets the test suite clear the memoized results. */
export const _clearLocationCache = () => locationCache.clear();

/**
 * Split "Chennai, Tamil Nadu" / "Tamil Nadu, Chennai" into a best-guess
 * city + state. Non-comma input returns the whole value as the city guess.
 */
const parseCommaInput = (normalized) => {
  const parts = normalized.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { cityGuess: canonicalizeCity(normalized), stateGuess: "" };
  }

  // Whichever part is a recognised state is the state; the other is the city.
  const stateFirst = canonicalizeState(parts[0]);
  const stateLast = canonicalizeState(parts[parts.length - 1]);

  if (stateLast) {
    return { cityGuess: canonicalizeCity(parts[0]), stateGuess: stateLast };
  }
  if (stateFirst) {
    return { cityGuess: canonicalizeCity(parts[1]), stateGuess: stateFirst };
  }
  return { cityGuess: canonicalizeCity(parts[0]), stateGuess: "" };
};

/**
 * Pick the most "city-like" value from a Geoapify result, preferring a real
 * parent city over a suburb/locality so "Velachery" → "Chennai".
 */
const extractCity = (r = {}) =>
  r.city || r.town || r.municipality || r.county || r.village || r.suburb || "";

const buildFallback = (cityGuess, stateGuess, normalized) => {
  const city = cityGuess || canonicalizeCity(normalized);
  return {
    city,
    // Even without Geoapify we can often infer the state from a known city.
    state: stateGuess || stateForCity(city) || null,
    country: "India",
    countryCode: "in",
    source: "fallback",
  };
};

/**
 * Network-free resolution: normalize + alias + comma parse + city→state map.
 * Used by the backfill script and as the Geoapify fallback.
 */
export const resolveLocationOffline = (rawLocation) => {
  const normalized = normalizeLocationValue(rawLocation);
  if (!normalized) {
    return { city: "", state: null, country: "India", countryCode: "in", source: "fallback" };
  }
  const { cityGuess, stateGuess } = parseCommaInput(normalized);
  return buildFallback(cityGuess, stateGuess, normalized);
};

const geocodeWithGeoapify = async (text, cfg) => {
  const url = new URL(cfg.baseUrl);
  url.searchParams.set("text", text);
  url.searchParams.set("filter", `countrycode:${cfg.countryCode}`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", cfg.apiKey);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(cfg.timeoutMs),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Geoapify responded ${res.status}`);
  }

  const json = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  if (results.length === 0) {
    throw new Error("Geoapify returned no results");
  }
  return results[0];
};

/**
 * @param {string} rawLocation single free-text location value
 * @returns {Promise<{ city: string, state: string|null, country: string,
 *                      countryCode: string, source: "geoapify"|"fallback" }>}
 */
export const resolveLocation = async (rawLocation) => {
  const normalized = normalizeLocationValue(rawLocation);
  if (!normalized) {
    return { city: "", state: null, country: "India", countryCode: "in", source: "fallback" };
  }

  const cacheKey = `location:${normalized.toLowerCase()}`;
  const cached = locationCache.get(cacheKey);
  if (cached) return cached;

  const { cityGuess, stateGuess } = parseCommaInput(normalized);
  const cfg = getGeoapifyConfig();

  let result;
  if (!cfg.enabled) {
    result = buildFallback(cityGuess, stateGuess, normalized);
  } else {
    try {
      const query = stateGuess ? `${cityGuess || normalized}, ${stateGuess}` : cityGuess || normalized;
      const r = await geocodeWithGeoapify(query, cfg);

      const countryCode = String(r.country_code || "").toLowerCase();
      const resolvedCity = canonicalizeCity(extractCity(r));
      const resolvedState = canonicalizeState(r.state);

      if (countryCode !== "in" || !resolvedCity) {
        result = buildFallback(cityGuess, stateGuess, normalized);
      } else {
        result = {
          city: resolvedCity,
          state: resolvedState || stateGuess || stateForCity(resolvedCity) || null,
          country: r.country || "India",
          countryCode: "in",
          source: "geoapify",
        };
      }
    } catch (err) {
      // Never leak the API key; err.message here is safe (status / timeout text).
      console.warn(`[Geoapify] location resolution failed for "${normalized}": ${err.message}. Using fallback.`);
      result = buildFallback(cityGuess, stateGuess, normalized);
    }
  }

  locationCache.set(cacheKey, result);
  return result;
};

export default resolveLocation;
