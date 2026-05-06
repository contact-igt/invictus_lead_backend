import crypto from "crypto";

const API_KEY_HEADER_NAME = "x-api-key";

const parseIpWhitelist = () => {
  return String(process.env.RUNO_WEBHOOK_IP_WHITELIST || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
};

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.connection?.remoteAddress || "unknown";
};

const getHeaderValue = (value) => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const timingSafeCompare = (actual, expected) => {
  if (!actual || !expected) return false;

  const actualHash = crypto.createHash("sha256").update(String(actual)).digest();
  const expectedHash = crypto.createHash("sha256").update(String(expected)).digest();

  return crypto.timingSafeEqual(actualHash, expectedHash);
};

export const setWebhookSecurityHeaders = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
};

export const logWebhookRequest = (req, res, next) => {
  const requestIp = getClientIp(req);
  console.info(
    `[webhook][Runo][PixelEye] ${req.method} ${req.originalUrl} ip=${requestIp}`,
  );
  next();
};

export const verifyWebhookApiKey = async (req, res, next) => {
  const requestIp = getClientIp(req);
  const incomingApiKey = getHeaderValue(req.headers[API_KEY_HEADER_NAME]);

  if (!incomingApiKey) {
    const responsePayload = {
      success: false,
      message: "Missing API key",
    };

    return res.status(401).json(responsePayload);
  }

  const expectedApiKey = String(process.env.RUNO_WEBHOOK_API_KEY || "").trim();
  if (!expectedApiKey) {
    const responsePayload = {
      success: false,
      message: "Webhook service unavailable",
    };

    return res.status(503).json(responsePayload);
  }

  const isValidApiKey = timingSafeCompare(
    String(incomingApiKey).trim(),
    expectedApiKey,
  );

  if (!isValidApiKey) {
    const responsePayload = {
      success: false,
      message: "Invalid API key",
    };

    return res.status(403).json(responsePayload);
  }

  const whitelist = parseIpWhitelist();
  if (whitelist.length > 0 && !whitelist.includes(requestIp)) {
    const responsePayload = {
      success: false,
      message: "Webhook source IP not allowed",
    };

    return res.status(403).json(responsePayload);
  }

  req.webhookMeta = {
    requestIp,
    serviceName: "Runo",
  };

  return next();
};
