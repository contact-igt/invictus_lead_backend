import { processRepliBirthwaveWebhook } from "./repliWebhook.service.js";

const isDebug = () =>
  String(process.env.REPLI_BIRTHWAVE_WEBHOOK_DEBUG || "").toLowerCase() ===
  "true";

/**
 * Stage/local-only arrival log — printed before signature verification so it
 * captures every delivery regardless of outcome (useful for ngrok testing).
 * Never logs REPLI_BIRTHWAVE_WEBHOOK_SECRET or the signature value itself.
 * Gated behind REPLI_BIRTHWAVE_WEBHOOK_DEBUG; keep that "false" in production
 * — req.body can carry lead PII (name/email/questionnaire answers).
 */
const logIncomingRepliWebhook = (req) => {
  if (!isDebug()) return;
  console.log("\n========== REPLI WEBHOOK RECEIVED ==========");
  console.log("Time:", new Date().toISOString());
  console.log("Event:", req.headers["x-repli-event"]);
  console.log("Delivery ID:", req.headers["x-repli-delivery"]);
  console.log("Signature present:", Boolean(req.headers["x-repli-signature"]));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("============================================\n");
};

/**
 * Thin HTTP boundary. The route mounts express.raw() so `req.body` is the exact
 * bytes Repli sent — required for HMAC verification. All decisions live in the
 * service; the controller only maps the result to a response.
 */
export const handleRepliBirthwaveWebhook = async (req, res) => {
  logIncomingRepliWebhook(req);

  try {
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string"
              ? req.body
              : JSON.stringify(req.body ?? {}),
            "utf8",
          );

    const { status, payload } = await processRepliBirthwaveWebhook({
      rawBody,
      headers: req.headers,
    });

    return res.status(status).json(payload);
  } catch (err) {
    console.error(
      `[Repli][Birthwave] unhandled webhook error: ${err?.message}`,
    );
    return res
      .status(500)
      .json({ success: false, message: "Webhook processing failed" });
  }
};

export default handleRepliBirthwaveWebhook;
