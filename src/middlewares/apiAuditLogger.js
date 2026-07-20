import crypto from "node:crypto";
import db from "../database/index.js";

const SENSITIVE_KEY = /password|token|authorization|secret|api[_-]?key|signature/i;
const MAX_PREVIEW_LENGTH = 8000;

const redact = (value, depth = 0) => {
  if (depth > 5 || value == null) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1),
    ]),
  );
};

const toPreview = (value) => {
  if (value === undefined || value === null) return null;
  const safeValue = redact(value);
  const text = JSON.stringify(safeValue);
  if (text.length <= MAX_PREVIEW_LENGTH) return safeValue;
  return { truncated: true, preview: text.slice(0, MAX_PREVIEW_LENGTH) };
};

export const apiAuditLogger = (req, res, next) => {
  if (!req.originalUrl.startsWith("/api/v1")) {
    return next();
  }

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  let responsePayload;
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    responsePayload = payload;
    return originalJson(payload);
  };

  res.on("finish", () => {
    const contentType = String(res.getHeader("content-type") || "");
    const isDownload = Boolean(res.getHeader("content-disposition")) || !contentType.includes("json");
    const errorMessage =
      responsePayload && typeof responsePayload === "object"
        ? String(responsePayload.message || "").slice(0, 1000) || null
        : null;

    void db.ApiLog.create({
      request_id: requestId,
      method: req.method,
      path: req.baseUrl + req.path,
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
      user_id: req.user?.id || null,
      user_email: req.user?.email || null,
      user_role: req.user?.role || null,
      client_id: req.tenant?.id || req.user?.clientId || req.publicTenantId || null,
      ip_address: req.ip || null,
      request_body: toPreview({ query: req.query, body: req.body }),
      response_body: isDownload ? { omitted: "non-json response" } : toPreview(responsePayload),
      error_message: res.statusCode >= 400 ? errorMessage : null,
    }).catch((error) => {
      console.error("[api-audit] Failed to persist request log", error.message);
    });
  });

  next();
};
