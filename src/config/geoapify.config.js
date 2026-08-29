import dotenv from "dotenv";

dotenv.config();

/**
 * Geoapify forward-geocoding config for careers location resolution.
 *
 * Neither variable is required — if the key is missing or the feature is
 * disabled, location resolution falls back to local normalization and
 * application creation keeps working.
 *
 *   GEOAPIFY_API_KEY            backend-only secret (never sent to the browser)
 *   GEOAPIFY_GEOCODING_ENABLED  "true"/"1" to enable; when unset it defaults to
 *                               enabled *if* a key is present
 *
 * Read fresh on each call so tests can toggle env without module-cache games.
 */
export const getGeoapifyConfig = () => {
  const apiKey = (process.env.GEOAPIFY_API_KEY || "").trim();
  const flag = (process.env.GEOAPIFY_GEOCODING_ENABLED || "").trim().toLowerCase();
  const enabled =
    Boolean(apiKey) && (flag === "" ? true : flag === "true" || flag === "1");

  return {
    apiKey,
    enabled,
    baseUrl: "https://api.geoapify.com/v1/geocode/search",
    countryCode: "in",
    timeoutMs: 4000,
  };
};

export default getGeoapifyConfig;
