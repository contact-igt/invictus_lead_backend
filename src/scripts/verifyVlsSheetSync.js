import assert from "node:assert/strict";
import { sendSheetRecord } from "../modules/vls/vlsSheetSync.service.js";

let url = "";
let body = "";
await sendSheetRecord(
  {
    name: "Test", email: "test@example.test", mobile: "9876543210", amount: 499,
    page_name: "constitutional-law-bootcamp", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1",
    payment_status: "paid", programm_date: "2026-11-13", registered_date: "2026-10-31",
    ip_address: "203.0.113.10", utm_source: "facebook", utm_medium: "paid_social",
    utm_campaign: "bootcamp", utm_term: "constitutional", utm_content: "video-a",
  },
  "constitutionalBootcamp",
  { env: {}, fetchImpl: async (requestUrl, init) => {
    url = requestUrl;
    body = init.body.toString();
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: "success" }) };
  } },
);
assert.match(url, /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
const params = new URLSearchParams(body);
assert.deepEqual([...params.keys()], [
  "form_type", "name", "email", "mobile", "amount", "page_name", "razorpay_order_id",
  "razorpay_payment_id", "payment_status", "programm_date", "registered_date", "ip_address",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
]);
assert.equal(params.get("amount"), "499");
assert.equal(params.get("utm_content"), "video-a");

await sendSheetRecord(
  {
    name: "Test", mobile: "+919876543210", who_are_you: "Advocate",
    why_join: "Learn AI-assisted legal workflows", attending: "yes", payment_status: "waitlist",
    programm_date: "Sunday, 15 November 2026", page_name: "decoding-of-practice",
  },
  "dopAiAssisted",
  { env: {}, fetchImpl: async (requestUrl, init) => {
    url = requestUrl;
    body = init.body.toString();
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: "success" }) };
  } },
);
const dopParams = new URLSearchParams(body);
assert.match(url, /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
assert.equal(dopParams.get("who_are_you"), "Advocate");
assert.equal(dopParams.get("why_join"), "Learn AI-assisted legal workflows");
assert.equal(dopParams.get("attending"), "yes");
console.log("VLS Constitutional Bootcamp sheet sync verification passed.");
