import crypto from "crypto";

const MAX_SKEW_SECONDS = 5 * 60;

const header = (req, name) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Verifies server-to-server calls from the Birthwave check-in app.
 * Signature = "sha256=" + hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
 * Requires req.rawBody (captured by the express.json verify hook in app.js).
 */
export const verifyBirthwaveSignature = (req, res, next) => {
  const secret = String(process.env.BIRTHWAVE_CRM_SHARED_SECRET || "").trim();
  if (secret.length < 32) {
    return res.status(503).json({ success: false, message: "Intake unavailable" });
  }

  const timestamp = String(header(req, "x-birthwave-timestamp") || "").trim();
  const signature = String(header(req, "x-birthwave-signature") || "").trim();

  if (!/^\d{9,12}$/.test(timestamp) || !signature || !req.rawBody) {
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (ageSeconds > MAX_SKEW_SECONDS) {
    return res.status(401).json({ success: false, message: "Request expired" });
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(req.rawBody)
    .digest("hex")}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }

  return next();
};
