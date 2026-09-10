import "dotenv/config";
import crypto from "node:crypto";

/**
 * Stage 1 manual connectivity + HMAC check for the existing Repli → Birthwave
 * webhook. Sends a signed `test.ping` to REPLI_BIRTHWAVE_TEST_URL (an ngrok
 * HTTPS URL pointing at this backend) and prints the result.
 *
 *   npm run test:repli:ping
 *   npm run test:repli:ping -- --wrong-secret   # expect 401
 *   npm run test:repli:ping -- --tamper         # expect 401 (body changed after signing)
 *   npm run test:repli:ping -- --no-signature   # expect 401
 *
 * This script NEVER sends lead.created / lead.completed and creates no lead.
 * It does not import backend modules — it only makes an HTTP request.
 */

const flags = new Set(process.argv.slice(2));
const debug =
  String(process.env.REPLI_BIRTHWAVE_WEBHOOK_DEBUG || "").toLowerCase() ===
  "true";

const SECRET = process.env.REPLI_BIRTHWAVE_WEBHOOK_SECRET;
const URL = process.env.REPLI_BIRTHWAVE_TEST_URL;

if (!URL) {
  console.error(
    "Missing REPLI_BIRTHWAVE_TEST_URL — set it to your ngrok URL, e.g.\n" +
      "  https://<ngrok-domain>/api/v1/integrations/repli/birthwave/webhook",
  );
  process.exit(1);
}
if (!SECRET && !flags.has("--no-signature")) {
  console.error("Missing REPLI_BIRTHWAVE_WEBHOOK_SECRET (the Repli endpoint Signing Secret).");
  process.exit(1);
}

const deliveryId = `manual-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

const payload = {
  event: "test.ping",
  timestamp: new Date().toISOString(),
  message: "Manual Repli Birthwave webhook test",
};

// Serialize exactly once — this exact string is both signed and sent.
const rawBody = JSON.stringify(payload);

const signingSecret = flags.has("--wrong-secret")
  ? `${SECRET || "no-secret"}-WRONG`
  : SECRET;

const signature = signingSecret
  ? crypto.createHmac("sha256", signingSecret).update(Buffer.from(rawBody)).digest("hex")
  : "";

// --tamper: sign the original body, then send a mutated body → must fail.
const bodyToSend = flags.has("--tamper")
  ? JSON.stringify({ ...payload, message: "tampered after signing" })
  : rawBody;

const headers = {
  "Content-Type": "application/json",
  "X-Repli-Event": "test.ping",
  "X-Repli-Delivery": deliveryId,
};
if (!flags.has("--no-signature")) {
  headers["X-Repli-Signature"] = signature;
}

const run = async () => {
  console.log(`URL:         ${URL}`);
  console.log(`Delivery ID: ${deliveryId}`);
  console.log(
    `Mode:        ${
      [...flags].join(" ") || "signed test.ping (expect 200 / pong)"
    }`,
  );
  if (debug && headers["X-Repli-Signature"]) {
    console.log(`Signature:   ${headers["X-Repli-Signature"]}`);
    console.log(`Raw body:    ${rawBody}`);
  }

  let res;
  try {
    res = await fetch(URL, { method: "POST", headers, body: bodyToSend });
  } catch (err) {
    console.error(`\nRequest failed: ${err.message}`);
    console.error("Is the backend running and is the ngrok tunnel up?");
    process.exit(1);
  }

  const text = await res.text();
  console.log(`\nHTTP status: ${res.status}`);
  console.log(`Response:    ${text}`);

  const expectOk = !(
    flags.has("--wrong-secret") ||
    flags.has("--tamper") ||
    flags.has("--no-signature")
  );

  if (expectOk) {
    const pass = res.status === 200 && /"pong"\s*:\s*true/.test(text);
    console.log(pass ? "\nPASS — signature verified, test.ping ponged." : "\nFAIL — expected 200 with pong:true.");
    process.exit(pass ? 0 : 1);
  } else {
    const pass = res.status === 401;
    console.log(pass ? "\nPASS — rejected with 401 as expected." : "\nFAIL — expected 401.");
    process.exit(pass ? 0 : 1);
  }
};

run();
