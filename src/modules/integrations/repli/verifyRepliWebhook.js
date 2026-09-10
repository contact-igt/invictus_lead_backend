import crypto from "crypto";

/**
 * Repli outgoing-webhook verification.
 *
 * Per Repli's Outgoing Webhooks documentation, every event is POSTed with an
 * `X-Repli-Signature` header containing the HMAC-SHA256 of the *raw* request
 * body, keyed by the endpoint secret shown in the Repli Developers UI when the
 * webhook endpoint is created.
 *
 * This module implements ONLY that mechanism. It never derives the signature
 * from a re-serialized body, and it never logs the secret.
 */

const SIGNATURE_HEADER = "x-repli-signature";

const firstHeader = (value) => (Array.isArray(value) ? value[0] : value);

/**
 * Repli may send the signature as bare lowercase hex or with a `sha256=`
 * prefix. Accept both; reject anything else.
 */
const parseSignatureHeader = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return null;
  const withoutPrefix = text.includes("=")
    ? text.slice(text.indexOf("=") + 1).trim()
    : text;
  const normalized = withoutPrefix.toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
};

const timingSafeHexEqual = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
};

/**
 * @param {Buffer|string} rawBody exact bytes received on the wire
 * @param {object} headers req.headers
 * @param {string} secret REPLI_BIRTHWAVE_WEBHOOK_SECRET
 * @returns {{ ok: boolean, reason?: string, signatureFormat?: string }}
 */
export const verifyRepliSignature = (rawBody, headers = {}, secret) => {
  if (!secret) {
    return { ok: false, reason: "webhook secret not configured" };
  }

  const headerValue = firstHeader(headers[SIGNATURE_HEADER]);
  if (!headerValue) {
    return { ok: false, reason: "missing X-Repli-Signature header" };
  }

  const provided = parseSignatureHeader(headerValue);
  if (!provided) {
    return { ok: false, reason: "malformed X-Repli-Signature header" };
  }

  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody ?? ""), "utf8");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (!timingSafeHexEqual(expected, provided)) {
    return { ok: false, reason: "signature mismatch" };
  }

  return {
    ok: true,
    signatureFormat: String(headerValue).includes("=") ? "prefixed" : "hex",
  };
};

export const REPLI_SIGNATURE_HEADER = SIGNATURE_HEADER;
