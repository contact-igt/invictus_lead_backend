import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRepliSignature } from "../modules/integrations/repli/verifyRepliWebhook.js";
import { normalizeRepliBirthwaveLead } from "../modules/integrations/repli/normalizeRepliBirthwaveLead.js";
import {
  REPLI_BIRTHWAVE_LEAD_EVENTS,
  REPLI_PING_EVENT,
} from "../modules/integrations/repli/repliWebhook.service.js";

/**
 * DB-free unit checks for the Repli → Birthwave webhook primitives, matching
 * the other `verify*` scripts in this repo. End-to-end create/update/dedupe
 * against MySQL is covered by the manual E2E checklist in
 * docs/REPLI_BIRTHWAVE_INTEGRATION.md.
 */

const SECRET = "test_endpoint_secret_123";
const sign = (raw) =>
  crypto.createHmac("sha256", SECRET).update(raw).digest("hex");

// ── Signature verification ────────────────────────────────────────────────
const body = JSON.stringify({ event: "lead.created", lead: { phone: "9876543210" } });

// valid, bare hex
assert.equal(
  verifyRepliSignature(Buffer.from(body), { "x-repli-signature": sign(body) }, SECRET).ok,
  true,
  "valid bare-hex signature accepted",
);

// valid, sha256= prefixed
assert.equal(
  verifyRepliSignature(Buffer.from(body), { "x-repli-signature": `sha256=${sign(body)}` }, SECRET).ok,
  true,
  "valid sha256=-prefixed signature accepted",
);

// tampered body
assert.equal(
  verifyRepliSignature(Buffer.from(body + " "), { "x-repli-signature": sign(body) }, SECRET).ok,
  false,
  "signature mismatch rejected",
);

// missing header
assert.equal(verifyRepliSignature(Buffer.from(body), {}, SECRET).ok, false, "missing header rejected");

// malformed header
assert.equal(
  verifyRepliSignature(Buffer.from(body), { "x-repli-signature": "not-hex" }, SECRET).ok,
  false,
  "malformed header rejected",
);

// no secret configured
assert.equal(
  verifyRepliSignature(Buffer.from(body), { "x-repli-signature": sign(body) }, "").ok,
  false,
  "absent secret rejected",
);

// wrong secret
assert.equal(
  verifyRepliSignature(Buffer.from(body), { "x-repli-signature": sign(body) }, "other").ok,
  false,
  "wrong secret rejected",
);

// ── Lead normalizer ──────────────────────────────────────────────────────
const n1 = normalizeRepliBirthwaveLead({
  event: "lead.created",
  data: {
    lead: {
      full_name: "Asha Rao",
      phone: "+91 98765 43210",
      email: "asha@example.com",
      lead_id: "REPLI-LEAD-9",
      conversation_id: "CONV-3",
      workspace_id: "WS-1",
      agent_id: "AG-2",
      campaign: "Birthwave Instagram September",
      lead_score: "82",
      answers: { reason_for_visit: "Pregnancy consultation", location: "Chennai" },
    },
  },
});

assert.equal(n1.name, "Asha Rao");
assert.equal(n1.phone, "+91 98765 43210"); // raw passthrough; canonicalised later by normalizePhone
assert.equal(n1.email, "asha@example.com");
assert.equal(n1.source, "instagram");
assert.equal(n1.originalSource, "INSTAGRAM");
assert.equal(n1.externalLeadId, "REPLI-LEAD-9");
assert.equal(n1.conversationId, "CONV-3");
assert.equal(n1.workspaceId, "WS-1");
assert.equal(n1.agentId, "AG-2");
assert.equal(n1.campaign, "Birthwave Instagram September");
assert.equal(n1.leadScore, 82);
assert.equal(n1.answers.reason_for_visit, "Pregnancy consultation");
assert.equal(n1.answers.location, "Chennai");

// flat payload, snake+camel tolerance, missing fields stay null
const n2 = normalizeRepliBirthwaveLead({ phoneNumber: "9998887777" });
assert.equal(n2.phone, "9998887777");
assert.equal(n2.name, null);
assert.equal(n2.email, null);
assert.equal(n2.externalLeadId, null);
assert.equal(n2.leadScore, null);

// empty payload never throws
const n3 = normalizeRepliBirthwaveLead({});
assert.equal(n3.phone, null);
assert.equal(n3.source, "instagram");

// root-level `id` must NOT be treated as the Repli lead id
const n4 = normalizeRepliBirthwaveLead({
  id: "evt_root_123",
  event: "lead.created",
  data: { lead: { id: "lead_abc", phone: "9876543210" } },
});
assert.equal(n4.externalLeadId, "lead_abc", "nested data.lead.id is the lead id");
assert.equal(n4.rootId, "evt_root_123", "root id preserved as rootId only");

const n5 = normalizeRepliBirthwaveLead({ id: "evt_only", phone: "9876543210" });
assert.equal(n5.externalLeadId, null, "bare root id is not a lead id");
assert.equal(n5.rootId, "evt_only");

// ── Event classification (actual Repli event names) ──────────────────────
assert.equal(REPLI_BIRTHWAVE_LEAD_EVENTS.has("lead.created"), true, "A: lead.created is a lead event");
assert.equal(REPLI_BIRTHWAVE_LEAD_EVENTS.has("lead.completed"), true, "B: lead.completed is a lead event");
assert.equal(REPLI_PING_EVENT, "test.ping", "C: ping event constant");
assert.equal(REPLI_BIRTHWAVE_LEAD_EVENTS.has("test.ping"), false, "C: test.ping is not a lead event");
assert.equal(REPLI_BIRTHWAVE_LEAD_EVENTS.has("appointment.created"), false, "D: appointment.created ignored");
assert.equal(REPLI_BIRTHWAVE_LEAD_EVENTS.has("message.sent"), false, "E: message.sent ignored");
assert.equal(REPLI_BIRTHWAVE_LEAD_EVENTS.has("lead_captured"), false, "old assumed event name removed");
assert.equal(REPLI_BIRTHWAVE_LEAD_EVENTS.size, 2, "exactly two lead events");

console.log("Repli → Birthwave webhook primitives verified.");
