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
 * object. Verified results are cached in-process for a day; unresolved
 * fallbacks are retried on the next request.
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
const MIN_CITY_CONFIDENCE = 0.7;
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
  const knownState = stateForCity(city);
  return {
    city,
    // The deterministic city map wins over possibly mismatched user input.
    state: knownState || stateGuess || null,
    country: "India",
    countryCode: "in",
    source: "fallback",
    verified: Boolean(knownState),
  };
};

/**
 * Network-free resolution: normalize + alias + comma parse + city→state map.
 * Used by the backfill script and as the Geoapify fallback.
 */
export const resolveLocationOffline = (rawLocation) => {
  const normalized = normalizeLocationValue(rawLocation);
  if (!normalized) {
    return { city: "", state: null, country: "India", countryCode: "in", source: "fallback", verified: false };
  }
  const { cityGuess, stateGuess } = parseCommaInput(normalized);
  return buildFallback(cityGuess, stateGuess, normalized);
};

const geocodeWithGeoapify = async (text, cfg) => {
  const url = new URL(cfg.baseUrl);
  url.searchParams.set("text", text);
  url.searchParams.set("filter", `countrycode:${cfg.countryCode}`);
  url.searchParams.set("type", "city");
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
 * @param {string} rawLocation single free-text city/location value
 * @param {string} [rawState] optional separately submitted state
 * @returns {Promise<{ city: string, state: string|null, country: string,
 *                      countryCode: string, source: "geoapify"|"fallback",
 *                      verified: boolean }>}
 */
export const resolveLocation = async (rawLocation, rawState) => {
  const normalizedLocation = normalizeLocationValue(rawLocation);
  if (!normalizedLocation) {
    return { city: "", state: null, country: "India", countryCode: "in", source: "fallback", verified: false };
  }
  const normalizedState = normalizeLocationValue(rawState);
  const normalized = normalizedState && !normalizedLocation.includes(",")
    ? `${normalizedLocation}, ${normalizedState}`
    : normalizedLocation;

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
      const query = stateGuess
        ? `${cityGuess || normalized}, ${stateGuess}`
        : normalized.includes(",") ? normalized : cityGuess || normalized;
      const r = await geocodeWithGeoapify(query, cfg);

      const countryCode = String(r.country_code || "").toLowerCase();
      const resolvedCity = canonicalizeCity(extractCity(r));
      const resolvedState = canonicalizeState(r.state);
      const confidence = Number(r.rank?.confidence_city_level ?? r.rank?.confidence ?? 0);
      const isVerifiedCity = r.result_type === "city" && confidence >= MIN_CITY_CONFIDENCE;
      const verifiedState = resolvedState || stateForCity(resolvedCity) || stateGuess;

      if (countryCode !== "in" || !resolvedCity || !isVerifiedCity || !verifiedState) {
        result = buildFallback(cityGuess, stateGuess, normalized);
      } else {
        result = {
          city: resolvedCity,
          state: verifiedState,
          country: r.country || "India",
          countryCode: "in",
          source: "geoapify",
          verified: true,
        };
      }
    } catch (err) {
      // Never leak the API key; err.message here is safe (status / timeout text).
      console.warn(`[Geoapify] location resolution failed for "${normalized}": ${err.message}. Using fallback.`);
      result = buildFallback(cityGuess, stateGuess, normalized);
    }
  }

  if (result.verified) locationCache.set(cacheKey, result);
  return result;
};

export default resolveLocation;
