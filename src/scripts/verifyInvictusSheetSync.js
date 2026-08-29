import assert from "node:assert/strict";
import {
  attemptSheetSync,
  buildSheetPayload,
  selectSheetWebhookUrl,
  sendSheetRecord,
} from "../modules/invictusEnquiry/invictusSheetSync.service.js";

const env = {
  GOOGLE_SHEETS_DEFAULT_WEBHOOK_URL: "https://example.test/default",
  GOOGLE_SHEETS_TELECALLING_WEBHOOK_URL: "https://example.test/telecalling",
};

assert.equal(
  selectSheetWebhookUrl("career", { role_slug: "telecalling-executive" }, env),
  env.GOOGLE_SHEETS_TELECALLING_WEBHOOK_URL,
);
assert.equal(
  selectSheetWebhookUrl("career", { role_slug: "graphic-designer" }, env),
  env.GOOGLE_SHEETS_DEFAULT_WEBHOOK_URL,
);
assert.equal(selectSheetWebhookUrl("general", {}, env), env.GOOGLE_SHEETS_DEFAULT_WEBHOOK_URL);

const career = {
  id: "career-id",
  application_reference: "IGT-ABC123",
  role: "Telecalling Executive",
  role_slug: "telecalling-executive",
  full_name: "Test Candidate",
  phone: "9876543210",
  email: "candidate@example.test",
  current_city: "Chennai",
  tools: ["crm", "google_sheets"],
  work_categories: ["lead_follow_up"],
  screening_flags: [],
  status: "New",
  createdAt: new Date("2026-08-29T10:00:00.000Z"),
};

const careerPayload = buildSheetPayload("career", career);
assert.equal(careerPayload.sheet, "Careers");
assert.equal(careerPayload.application_reference, "IGT-ABC123");
assert.equal(careerPayload.name, "Test Candidate");
assert.equal(careerPayload.mobile, "9876543210");

const generalPayload = buildSheetPayload("general", {
  id: "general-id",
  name: "Contact Person",
  mobile: "9876543210",
  applied_for: "General Inquiry",
});
assert.equal(generalPayload.sheet, "Sheet1");
assert.equal(generalPayload.submission_id, "general-id");

let requestedUrl = "";
await sendSheetRecord("career", career, {
  env,
  timeoutMs: 100,
  fetchImpl: async (url) => {
    requestedUrl = url;
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  },
});
assert.equal(requestedUrl, env.GOOGLE_SHEETS_TELECALLING_WEBHOOK_URL);

await assert.rejects(
  sendSheetRecord("career", career, {
    env,
    timeoutMs: 100,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: false, error: "append failed" }),
    }),
  }),
  /rejected the row/,
);

const failedRecord = {
  ...career,
  sheet_sync_attempts: 0,
  async update(changes) {
    Object.assign(this, changes);
  },
};
const originalConsoleError = console.error;
console.error = () => {};
const synced = await attemptSheetSync("career", failedRecord, {
  env,
  timeoutMs: 100,
  fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" }),
});
console.error = originalConsoleError;
assert.equal(synced, false);
assert.equal(failedRecord.sheet_sync_status, "failed");
assert.equal(failedRecord.sheet_sync_attempts, 1);
assert.ok(failedRecord.sheet_sync_next_attempt_at instanceof Date);

console.log("Invictus Sheet sync verification passed.");
