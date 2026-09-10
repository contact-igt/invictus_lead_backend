/**
 * IGT → Repli REST client. Used only by the historical lead sync
 * (`repliSync.service.js`) — never by the inbound webhook, which is
 * authenticated the other direction (Repli → IGT, HMAC).
 *
 * REPLI_API_KEY is a distinct secret from REPLI_BIRTHWAVE_WEBHOOK_SECRET and
 * is never sent to, or usable by, the frontend.
 */

export class RepliApiError extends Error {
  constructor(message, { status = 502 } = {}) {
    super(message);
    this.name = "RepliApiError";
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 15000;

/**
 * GET {REPLI_API_BASE_URL}/leads?limit=<n>&platform=instagram
 *
 * Only this one confirmed request shape (Repli Developers UI) is
 * implemented. Pagination (`page`/`offset`/`cursor`/`next`) is deliberately
 * NOT guessed — see extractRepliPaginationHint below.
 */
export const fetchRepliLeads = async ({ limit } = {}) => {
  const baseUrl = process.env.REPLI_API_BASE_URL;
  const apiKey = process.env.REPLI_API_KEY;

  if (!baseUrl) {
    throw new RepliApiError("REPLI_API_BASE_URL is not configured", { status: 500 });
  }
  if (!apiKey) {
    throw new RepliApiError("REPLI_API_KEY is not configured", { status: 500 });
  }

  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/leads`);
  url.searchParams.set(
    "limit",
    String(limit ?? process.env.REPLI_BIRTHWAVE_SYNC_LIMIT ?? 50),
  );
  url.searchParams.set("platform", "instagram");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new RepliApiError("Repli API request timed out", { status: 504 });
    }
    throw new RepliApiError(`Repli API request failed: ${err?.message}`, {
      status: 502,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new RepliApiError("Repli API key invalid or unauthorized", {
      status: res.status,
    });
  }
  if (res.status === 429) {
    throw new RepliApiError("Repli API rate limited", { status: 429 });
  }
  if (res.status >= 500) {
    throw new RepliApiError("Repli API unavailable", { status: res.status });
  }
  if (!res.ok) {
    throw new RepliApiError(`Repli API returned HTTP ${res.status}`, {
      status: res.status,
    });
  }

  try {
    return await res.json();
  } catch {
    throw new RepliApiError("Repli API returned invalid JSON", { status: 502 });
  }
};

/**
 * Safe extraction of the lead array from an unconfirmed response envelope.
 * Tries the common shapes; returns [] rather than throwing if none match.
 */
export const extractRepliLeadList = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.leads)) return json.leads;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.leads)) return json.data.leads;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

/**
 * Surfaces any pagination-looking fields on the response WITHOUT acting on
 * them — the actual pagination shape is unconfirmed (see task notes). Report
 * this in the sync result so a follow-up patch can implement it precisely.
 */
export const extractRepliPaginationHint = (json) => {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const candidateKeys = [
    "next",
    "next_cursor",
    "nextCursor",
    "cursor",
    "offset",
    "has_more",
    "hasMore",
    "total",
    "page",
  ];
  const hint = {};
  for (const key of candidateKeys) {
    if (json[key] !== undefined) hint[key] = json[key];
  }
  return Object.keys(hint).length > 0 ? hint : null;
};
