import assert from "node:assert/strict";
import { sendSheetRecord } from "../modules/vls/vlsSheetSync.service.js";

let url = "";
await sendSheetRecord(
  { name: "Test", email: "test@example.test", mobile: "9876543210" },
  "constitutionalBootcamp",
  { env: {}, fetchImpl: async (requestUrl) => {
    url = requestUrl;
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: "success" }) };
  } },
);
assert.equal(url, "https://script.google.com/macros/s/AKfycbzvmdeq-LMlXIDUCdVW1XUCi413-vXW2UmrLxXffMVRvE8OxRLyw3-q-ubdiiSfhTZoyQ/exec");
console.log("VLS Constitutional Bootcamp sheet sync verification passed.");
