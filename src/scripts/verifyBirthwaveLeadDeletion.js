import assert from "node:assert/strict";
import db from "../database/index.js";
import { deleteLead } from "../modules/birthwave/birthwaveLeadDeletion.service.js";

// Stub persistence: these checks never connect to or delete from a database.
const originals = [];
const stub = (object, key, replacement) => {
  originals.push(() => { object[key] = replacement; });
  object[key] = replacement;
};
const actions = [];
const transaction = { LOCK: { UPDATE: "UPDATE" } };
let missing = false;
let failCleanup = false;
let committed = false;
let rolledBack = false;
try {
  stub(db.sequelize, "transaction", async (callback) => {
    actions.push("transaction");
    try { const result = await callback(transaction); committed = true; return result; }
    catch (error) { rolledBack = true; throw error; }
  });
  stub(db.BirthwaveLead, "findOne", async (options) => {
    assert.deepEqual(options.where, { client_id: 7, id: 181 });
    assert.equal(options.transaction, transaction);
    assert.equal(options.lock, "UPDATE");
    actions.push("find");
    return missing ? null : { id: 181, destroy: async (options) => {
      assert.equal(options.transaction, transaction);
      actions.push("lead");
    } };
  });
  for (const model of ["BirthwaveAttentionItem", "BirthwaveDisposition", "BirthwaveLeadActivity", "BirthwaveLeadAssignment", "BirthwaveTask", "BirthwaveAppointment"]) {
    stub(db[model], "destroy", async (options) => {
      assert.deepEqual(options.where, { client_id: 7, lead_id: 181 });
      assert.equal(options.transaction, transaction);
      if (failCleanup) throw new Error("Cleanup failed");
      actions.push(model);
    });
  }
  for (const [model, patch, where] of [
    ["BirthwaveTask", { parent_task_id: null }, { client_id: 7, lead_id: 181 }],
    ["BirthwaveWebsiteLead", { birthwave_lead_id: null }, { client_id: 7, birthwave_lead_id: 181 }],
    ["CrmCall", { lead_id: null }, { client_id: 7, lead_id: 181 }],
  ]) {
    stub(db[model], "update", async (values, options) => {
      assert.deepEqual(values, patch);
      assert.deepEqual(options.where, where);
      assert.equal(options.transaction, transaction);
      actions.push(`${model}:unlink`);
    });
  }
  for (const role of ["telecaller", "team-manager", "", undefined]) {
    await assert.rejects(deleteLead({ id: 7 }, 181, { role }), { status: 403 });
  }
  await assert.rejects(deleteLead({}, 181, { role: "admin" }), { status: 403 });
  assert.equal(actions.length, 0, "Unauthorized requests never access persistence");
  missing = true;
  await assert.rejects(deleteLead({ id: 7 }, 181, { role: "admin" }), { status: 404 });
  assert.deepEqual(actions, ["transaction", "find"]);
  missing = false;
  for (const role of ["admin", "super-admin", "client"]) {
    actions.length = 0;
    committed = false;
    assert.deepEqual(await deleteLead({ id: 7 }, 181, { role }), { id: 181 });
    assert.equal(committed, true);
    assert.equal(actions.at(-1), "lead");
    assert.ok(actions.indexOf("BirthwaveDisposition") < actions.indexOf("BirthwaveTask"));
    assert.ok(actions.indexOf("BirthwaveTask:unlink") < actions.indexOf("BirthwaveTask"));
  }
  actions.length = 0;
  committed = false;
  rolledBack = false;
  failCleanup = true;
  await assert.rejects(deleteLead({ id: 7 }, 181, { role: "admin" }), /Cleanup failed/);
  assert.equal(rolledBack, true);
  assert.equal(committed, false);
  assert.equal(actions.includes("lead"), false);
  console.log("Birthwave lead deletion checks passed: roles, tenant scope, missing lead, related records and transaction failure.");
} finally {
  originals.reverse().forEach((restore) => restore());
}
