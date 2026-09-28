import db from "../../../database/index.js";
import { logBirthwaveActivity } from "../../birthwave/birthwaveActivity.service.js";
import {
  mapBirthwaveLeadToRunoPayload,
  shouldSendBirthwaveLeadToRuno,
  runoSourceLabel,
} from "./runo.mapper.js";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 3_000];
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getRunoBirthwaveConfig = (env = process.env) => {
  const enabled = String(env.RUNO_BIRTHWAVE_ENABLED || "").trim().toLowerCase() === "true";
  const url = String(env.RUNO_BIRTHWAVE_WEBSITE_FORM_API_URL || "").trim();
  const timeoutMs = Number(env.RUNO_BIRTHWAVE_TIMEOUT_MS) > 0
    ? Number(env.RUNO_BIRTHWAVE_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const phoneFormat = ["national", "e164", "digits"].includes(env.RUNO_BIRTHWAVE_PHONE_FORMAT)
    ? env.RUNO_BIRTHWAVE_PHONE_FORMAT
    : "national";
  const isProduction = String(env.NODE_ENV || "").toLowerCase() === "production";

  let urlValid = false;
  try {
    const parsed = new URL(url);
    urlValid = parsed.protocol === "https:" || (!isProduction && parsed.protocol === "http:");
  } catch {
    urlValid = false;
  }

  return { enabled, url, urlValid, timeoutMs, phoneFormat };
};

const maskId = (lead) => ({ leadId: lead?.id ?? null });

// One HTTP attempt. Never includes the URL in any returned/logged value.
const postOnce = async ({ url, payload, timeoutMs, fetchImpl }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // Body is only read for diagnostics; malformed/non-JSON bodies are fine.
    const bodyText = await response.text().catch(() => "");
    let bodyJson = null;
    if (bodyText && /json/i.test(response.headers?.get?.("content-type") || "")) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        bodyJson = null;
      }
    }

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, statusCode: response.status, body: bodyJson };
    }
    return {
      ok: false,
      statusCode: response.status,
      errorCode: response.status >= 500 ? "RUNO_HTTP_5XX" : "RUNO_HTTP_4XX",
      retryable: RETRYABLE_STATUS.has(response.status),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, errorCode: "RUNO_TIMEOUT", retryable: true };
    }
    return { ok: false, errorCode: "RUNO_NETWORK", retryable: true };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Deliver one Birthwave lead to Runo. Never throws; always returns a
 * structured result: { attempted, success, statusCode?, errorCode?, attempts? }.
 */
export const sendBirthwaveLeadToRuno = async ({
  lead,
  sourceKey = lead?.source_provider,
  formContext = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
} = {}) => {
  const config = getRunoBirthwaveConfig(env);

  if (!config.enabled) return { attempted: false, success: false, errorCode: "RUNO_DISABLED" };
  if (!config.url || !config.urlValid) {
    console.error("[Runo] Birthwave delivery skipped: RUNO_BIRTHWAVE_WEBSITE_FORM_API_URL missing or invalid", maskId(lead));
    return { attempted: false, success: false, errorCode: "RUNO_URL_MISSING" };
  }

  let payload;
  try {
    payload = mapBirthwaveLeadToRunoPayload(lead, { ...formContext, sourceKey, phoneFormat: config.phoneFormat });
  } catch {
    return { attempted: false, success: false, errorCode: "RUNO_MAPPING_FAILED" };
  }
  if (!payload.your_name || !payload.your_phone) {
    return { attempted: false, success: false, errorCode: "RUNO_PAYLOAD_INVALID" };
  }

  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await postOnce({ url: config.url, payload, timeoutMs: config.timeoutMs, fetchImpl });
    if (last.ok) {
      console.log("[Runo] Birthwave delivery success", {
        ...maskId(lead), source: runoSourceLabel(sourceKey), httpStatus: last.statusCode, attempt,
      });
      return { attempted: true, success: true, statusCode: last.statusCode, attempts: attempt };
    }
    if (!last.retryable || attempt === MAX_ATTEMPTS) break;
    await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 3_000);
  }

  console.error("[Runo] Birthwave delivery failed", {
    ...maskId(lead), source: runoSourceLabel(sourceKey), errorCode: last.errorCode, httpStatus: last.statusCode ?? null,
  });
  return {
    attempted: true,
    success: false,
    statusCode: last.statusCode,
    errorCode: last.errorCode,
    attempts: Math.min(MAX_ATTEMPTS, last.retryable ? MAX_ATTEMPTS : 1),
  };
};

/**
 * Post-commit hook for createWebsiteLead(): eligibility -> send -> timeline
 * entry. Safe to call fire-and-forget; it never throws and never affects the
 * already-committed lead, the Google Sheet mirror or the API response.
 */
export const dispatchBirthwaveRunoDelivery = async ({ clientId, lead, formContext, env, fetchImpl, sleep } = {}) => {
  try {
    if (!getRunoBirthwaveConfig(env).enabled) return { attempted: false, success: false, errorCode: "RUNO_DISABLED" };

    const client = await db.Client.findOne({ where: { id: clientId }, attributes: ["client_key"] });
    if (!shouldSendBirthwaveLeadToRuno({
      clientKey: client?.client_key,
      source: lead?.source,
      sourceProvider: lead?.source_provider,
    })) {
      return { attempted: false, success: false, errorCode: "RUNO_NOT_ELIGIBLE" };
    }

    const result = await sendBirthwaveLeadToRuno({ lead, formContext, env, fetchImpl, sleep });
    if (result.attempted) {
      await logBirthwaveActivity({
        clientId,
        leadId: lead.id,
        actor: null,
        eventType: result.success ? "runo_synced" : "runo_sync_failed",
        title: result.success ? "Lead synced to Runo" : "Runo sync failed",
        description: result.success ? `HTTP ${result.statusCode}` : `${result.errorCode}${result.statusCode ? ` (HTTP ${result.statusCode})` : ""}`,
      });
    }
    return result;
  } catch (error) {
    console.error("[Runo] Birthwave delivery crashed (ignored)", { leadId: lead?.id ?? null, message: error?.message });
    return { attempted: false, success: false, errorCode: "RUNO_INTERNAL_ERROR" };
  }
};
