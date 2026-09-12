// BW-FIX-002 regression guard: birthwave_leads.status must always be stored
// in the canonical BIRTHWAVE_LEAD_STAGES vocabulary (NEW, ASSIGNED, ...),
// never the older 6-value legacy vocabulary (new_lead, assigned, ...).
// See BIRTHWAVE_PRODUCTION_FIX_LEDGER.md, BW-FIX-002.
import assert from "node:assert/strict";
import db from "../database/index.js";
import { createLead, updateLead } from "../modules/birthwave/birthwave.service.js";

const serverLine = process.env.INVICTUS_SERVER_LINE || "local";
if (!["local", "development"].includes(serverLine)) {
  throw new Error("Lead status vocabulary verification is restricted to local/development databases");
}

const LEGACY_VALUES = ["new_lead", "assigned", "contacted", "consultation_booked", "visited", "converted"];

const clientRow = await db.Client.findOne({ order: [["id", "ASC"]], attributes: ["id"] });
assert.ok(clientRow, "At least one local client is required for this verification");
const tenant = { id: clientRow.id };
const suffix = Date.now();
const leadIds = [];

try {
  // 1. Existing data must already be free of legacy-form values (backfill migration ran).
  // birthwave_leads.status uses utf8mb4_general_ci (case-insensitive) collation, so a
  // Sequelize `where: { status: LEGACY_VALUES }` IN-match would also match the stage-form
  // rows (e.g. "ASSIGNED" satisfies `status IN ('assigned', ...)`) and produce a false
  // positive here. Compare in JS (always case-sensitive) against the exact stored bytes
  // instead.
  const allStatuses = await db.BirthwaveLead.findAll({ attributes: ["status"], raw: true });
  const legacyRows = allStatuses.filter((row) => LEGACY_VALUES.includes(row.status));
  assert.equal(legacyRows.length, 0, `Found ${legacyRows.length} birthwave_leads row(s) still storing an exact legacy-vocabulary status value`);

  // 2. A freshly created lead must be stored as stage-form "NEW", not legacy "new_lead".
  const actor = { id: null, role: "super-admin" }; // bypasses team-membership lookup in birthwavePermissions.service.js
  const created = await createLead(
    tenant,
    { name: "BW-FIX-002 Verification Lead", phone: `+91900${String(suffix).slice(-7)}`, service: `verify-status-${suffix}`, source: "other" },
    actor,
  );
  leadIds.push(created.id);
  const createdRow = await db.BirthwaveLead.findByPk(created.id, { attributes: ["status"] });
  assert.equal(createdRow.status, "NEW", `Newly created lead must store status "NEW", got "${createdRow.status}"`);

  // 3. Updating with legacy-form input ("converted") must normalize to stage-form on write.
  await updateLead(tenant, created.id, { status: "converted" }, actor);
  const updatedRow = await db.BirthwaveLead.findByPk(created.id, { attributes: ["status"] });
  assert.equal(updatedRow.status, "CONVERTED", `Legacy-form update input "converted" must be stored as "CONVERTED", got "${updatedRow.status}"`);

  console.log(JSON.stringify({
    passed: true,
    checks: ["no-legacy-values-in-existing-data", "create-stores-stage-form", "update-normalizes-legacy-input-to-stage-form"],
  }, null, 2));
} finally {
  if (leadIds.length) {
    await db.BirthwaveTask.destroy({ where: { client_id: tenant.id, lead_id: leadIds } });
    await db.BirthwaveLeadAssignment.destroy({ where: { client_id: tenant.id, lead_id: leadIds } });
    await db.BirthwaveAttentionItem.destroy({ where: { client_id: tenant.id, lead_id: leadIds } });
    await db.BirthwaveLeadActivity.destroy({ where: { client_id: tenant.id, lead_id: leadIds } });
    await db.BirthwaveLead.destroy({ where: { client_id: tenant.id, id: leadIds } });
  }
  await db.sequelize.close();
}
