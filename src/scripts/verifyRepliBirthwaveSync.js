import assert from "node:assert/strict";
import {
  extractRepliLeadList,
  extractRepliPaginationHint,
  RepliApiError,
} from "../modules/integrations/repli/repliApi.service.js";
import { normalizeRepliBirthwaveLead } from "../modules/integrations/repli/normalizeRepliBirthwaveLead.js";
import {
  REPLI_PROVIDER,
  REPLI_LEAD_PLACEHOLDER_NAME,
  buildRepliIntegrationMetadata,
  mergeRepliIntegrationMetadata,
  hasSufficientRepliIdentity,
} from "../modules/integrations/repli/repliBirthwaveShared.service.js";
import { adaptRepliApiLeadRecord } from "../modules/integrations/repli/repliApiLeadAdapter.js";

/**
 * DB-free unit checks for the historical Repli `/leads` API sync primitives.
 * The live-DB paths (upsertBirthwaveRepliLead dedupe/create/enrich, the
 * actual Repli API call, and the full sync loop) require MySQL + a real
 * REPLI_API_KEY and are covered by the manual test flow in
 * docs/REPLI_BIRTHWAVE_INTEGRATION.md, not here.
 */

// ── Lead-list extraction (response shape unconfirmed — must not throw) ────
assert.deepEqual(extractRepliLeadList([{ id: 1 }]), [{ id: 1 }], "bare array");
assert.deepEqual(extractRepliLeadList({ leads: [{ id: 2 }] }), [{ id: 2 }], "{leads:[]}");
assert.deepEqual(extractRepliLeadList({ data: [{ id: 3 }] }), [{ id: 3 }], "{data:[]}");
assert.deepEqual(
  extractRepliLeadList({ data: { leads: [{ id: 4 }] } }),
  [{ id: 4 }],
  "{data:{leads:[]}}",
);
assert.deepEqual(extractRepliLeadList({ results: [{ id: 5 }] }), [{ id: 5 }], "{results:[]}");
assert.deepEqual(extractRepliLeadList({ unexpected: true }), [], "unknown shape -> []");
assert.deepEqual(extractRepliLeadList(null), [], "null -> []");
assert.deepEqual(extractRepliLeadList(undefined), [], "undefined -> []");

// ── Pagination hint is reported, never acted on ───────────────────────────
assert.equal(extractRepliPaginationHint({ leads: [] }), null, "no pagination fields -> null");
assert.deepEqual(
  extractRepliPaginationHint({ leads: [], next_cursor: "abc", total: 120 }),
  { next_cursor: "abc", total: 120 },
  "captures only present pagination-looking fields",
);
assert.equal(extractRepliPaginationHint([{ id: 1 }]), null, "array response -> null");
assert.equal(extractRepliPaginationHint(null), null);

// ── RepliApiError carries a status for the controller to map ─────────────
const err = new RepliApiError("Repli API key invalid or unauthorized", { status: 401 });
assert.equal(err.name, "RepliApiError");
assert.equal(err.status, 401);
assert.ok(err instanceof Error);

// ── Normalizer: flat API lead record (no event envelope) still maps ──────
const apiRecord = {
  id: "lead_row_1", // unconfirmed meaning — must NOT become source_external_id
  lead_id: "REPLI-HIST-1",
  full_name: "Priya S",
  phone_number: "9123456780",
  email: "priya@example.com",
  campaign: "Birthwave Instagram August",
  completed: true,
  answers: { location: "Bengaluru" },
};
const n = normalizeRepliBirthwaveLead(apiRecord);
assert.equal(n.name, "Priya S");
assert.equal(n.phone, "9123456780");
assert.equal(n.externalLeadId, "REPLI-HIST-1", "explicit lead_id wins over root id");
assert.equal(n.rootId, "lead_row_1");
assert.equal(n.completionState, true);
assert.equal(n.campaign, "Birthwave Instagram August");

// flat record with no explicit lead-id key: bare root `id` must not leak in
const apiRecordNoExplicitId = { id: "evt_123", phone: "9123456780" };
const n2 = normalizeRepliBirthwaveLead(apiRecordNoExplicitId);
assert.equal(n2.externalLeadId, null, "bare root id on a flat record is still not a lead id");
assert.equal(n2.rootId, "evt_123");

// ── Shared metadata builder used by both webhook + sync ──────────────────
const meta = buildRepliIntegrationMetadata(n, {
  sync_source: "api",
  sync_type: "historical",
});
assert.equal(meta.provider, REPLI_PROVIDER);
assert.equal(meta.sync_source, "api");
assert.equal(meta.sync_type, "historical");
assert.equal(meta.completion_state, true);

const merged = mergeRepliIntegrationMetadata(
  { answers: { a: 1 }, campaign: "old" },
  { answers: { b: 2 }, campaign: "new" },
);
assert.deepEqual(merged.answers, { a: 1, b: 2 }, "answers merge, not replace");
assert.equal(merged.campaign, "new", "other fields take the newer value");

assert.equal(REPLI_LEAD_PLACEHOLDER_NAME, "Instagram Lead");

// ── Real Repli /leads API record (confirmed shape) ────────────────────────
// Test 1 — real sample record.
const realApiRecord = {
  id: "60885461-830e-4a69-bb4b-3f33f0f7bf7c",
  platform: "instagram",
  status: "completed",
  instagram_username: "veera_72",
  telegram_username: null,
  collected_data: {
    "What is your name?": "veeravel",
    "What is your email address?": "veeravel.igt@gmail.com",
    "Q3: Which service are you interested in?": "pregnancy care",
  },
  created_at: "2026-09-04T08:54:01.517907+00:00",
  completed_at: "2026-09-04T08:55:31.536+00:00",
};
const n3 = normalizeRepliBirthwaveLead(adaptRepliApiLeadRecord(realApiRecord));
assert.equal(n3.externalLeadId, "60885461-830e-4a69-bb4b-3f33f0f7bf7c", "record.id -> source_external_id via adapter");
assert.equal(n3.name, "veeravel");
assert.equal(n3.service, "pregnancy care", "'Q3: Which service are you interested in?' -> service via tolerant label match");
assert.equal(n3.email, "veeravel.igt@gmail.com");
assert.equal(n3.phone, null, "no phone question in collected_data");
assert.equal(n3.completionState, "completed");
assert.deepEqual(n3.answers, realApiRecord.collected_data, "unrecognized answers preserved");
assert.equal(hasSufficientRepliIdentity(n3, null), true, "Test 4: external id alone is sufficient — NOT skipped for missing phone");

// Test 2 — phone recoverable from collected_data.
const n4 = normalizeRepliBirthwaveLead(
  adaptRepliApiLeadRecord({ id: "r2", collected_data: { "What is your mobile number?": "9876543210" } }),
);
assert.equal(n4.phone, "9876543210");

// Test 3 — alternate question label wording.
const labelCases = [
  ["Full Name", "priya"],
  ["Your name", "priya"],
  ["Email Address", "priya@example.com"],
  ["Your email", "priya@example.com"],
  ["Mobile Number", "9000000000"],
  ["Phone Number", "9000000000"],
  ["WhatsApp Number", "9000000000"],
  ["Contact Number", "9000000000"],
];
for (const [label, value] of labelCases) {
  const adapted = adaptRepliApiLeadRecord({ id: "r3", collected_data: { [label]: value } });
  const field = label.toLowerCase().includes("email") ? "email" : label.toLowerCase().includes("name") ? "name" : "phone";
  assert.equal(adapted[field], value, `label "${label}" recognized as ${field}`);
}

// Test 4 (identity rule) — external id, no phone: NOT insufficient.
assert.equal(hasSufficientRepliIdentity({ externalLeadId: "abc" }, null), true);
// Test 5 — no external id, no phone: insufficient (would be skipped).
assert.equal(hasSufficientRepliIdentity({ externalLeadId: null }, null), false, "Test 5: no id + no phone -> insufficient_identity");
// phone-only (no external id) remains a valid identity.
assert.equal(hasSufficientRepliIdentity({ externalLeadId: null }, "+919876543210"), true);

// Name fallback: no name question answered -> instagram_username.
const n5 = normalizeRepliBirthwaveLead(
  adaptRepliApiLeadRecord({ id: "r4", instagram_username: "someuser", collected_data: {} }),
);
assert.equal(n5.name, "someuser", "name falls back to instagram_username");

// Check persistence and the API response used by the Instagram screens.
const { default: db } = await import("../database/index.js");
const { listLeads, getLeadById } = await import("../modules/birthwave/birthwave.service.js");
assert.equal(db.BirthwaveLead.rawAttributes.phone.allowNull, true);
assert.ok(db.BirthwaveLead.rawAttributes.integration_metadata);
const originalList = db.BirthwaveLead.findAndCountAll;
const originalDetail = db.BirthwaveLead.findOne;
const metadata = { instagram_username: "sample", collected_data: { Name: "Example" } };
const model = db.BirthwaveLead.build({ name: "Example", phone: null });
model.setDataValue("integration_metadata", JSON.stringify(metadata));
assert.deepEqual(model.integration_metadata, metadata, "database JSON strings are decoded");
const row = { id: 1, client_id: 7, name: "Example", phone: null, integration_metadata: metadata };
try {
  db.BirthwaveLead.findAndCountAll = async ({ where }) => {
    assert.equal(where.client_id, 7);
    assert.equal(where.source, "instagram");
    assert.equal(where.source_provider, "REPLI");
    return { rows: [row], count: 1 };
  };
  db.BirthwaveLead.findOne = async ({ where }) => {
    assert.equal(where.client_id, 7);
    return row;
  };
  const list = await listLeads({ id: 7 }, { source: "instagram", source_provider: "REPLI" });
  assert.deepEqual(list.data[0].integration_metadata, metadata);
  assert.deepEqual((await getLeadById({ id: 7 }, 1)).integration_metadata, metadata);
} finally {
  db.BirthwaveLead.findAndCountAll = originalList;
  db.BirthwaveLead.findOne = originalDetail;
}
console.log("Repli → Birthwave historical sync primitives verified.");
