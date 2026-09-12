// BW-FIX-001: birthwave_dispositions.{client_id,lead_id,task_id} and
// birthwave_attention_items.client_id each carry two live FK constraints to
// the same target column: an auto-generated `<table>_ibfk_N` (created by
// sequelize.sync() the first time these tables were created, using the
// model's inline `references:` attribute, which defaults to ON DELETE NO
// ACTION) and the intentionally-named `fk_bw_*` constraint added later by
// 20260907_birthwave_dispositions / 20260907_birthwave_attention_items
// (ON DELETE CASCADE). MySQL/MariaDB enforces both; NO ACTION is checked
// immediately (behaves like RESTRICT), so the intended CASCADE can never
// fire — deleting a client/lead/task with dependent rows fails instead of
// cascading. This migration drops only the four stale, conflicting
// `_ibfk_N` constraints, leaving the single intentional `fk_bw_*`
// constraint (already present) as the sole FK per column. It does not
// touch the other duplicate-but-agreeing SET NULL/SET NULL pairs on
// birthwave_attention_items (lead_id/task_id/team_id/owner_id/
// acknowledged_by/resolved_by) — those are redundant but not conflicting,
// and out of scope for this fix (see BIRTHWAVE_PRODUCTION_FIX_LEDGER.md,
// BW-FIX-001).

const STALE_CONSTRAINTS = [
  { table: "birthwave_dispositions", name: "birthwave_dispositions_ibfk_1", column: "client_id", references: { table: "clients", field: "id" } },
  { table: "birthwave_dispositions", name: "birthwave_dispositions_ibfk_2", column: "lead_id", references: { table: "birthwave_leads", field: "id" } },
  { table: "birthwave_dispositions", name: "birthwave_dispositions_ibfk_3", column: "task_id", references: { table: "birthwave_tasks", field: "id" } },
  { table: "birthwave_attention_items", name: "birthwave_attention_items_ibfk_1", column: "client_id", references: { table: "clients", field: "id" } },
];

const constraintNames = (rows) =>
  new Set(rows.map((row) => String(row.constraintName || row.name || "").toLowerCase()));

const isMissingConstraintError = (error) =>
  error?.name === "SequelizeUnknownConstraintError" ||
  /doesn't exist|does not exist|unknown|not found/i.test(error?.message || "");

export const name = "20260908_birthwave_fk_duplicate_cleanup";

export async function up({ context: qi }) {
  for (const { table, name: constraintName } of STALE_CONSTRAINTS) {
    const existing = constraintNames(await qi.showConstraint(table));
    if (!existing.has(constraintName.toLowerCase())) continue; // already removed / never present
    await qi.removeConstraint(table, constraintName);
  }
}

export async function down({ context: qi }) {
  // Reversal recreates the original auto-generated constraints with their
  // original (default) ON DELETE NO ACTION / ON UPDATE CASCADE semantics,
  // under their original names, so the schema is bit-for-bit restorable.
  for (const { table, name: constraintName, column, references } of STALE_CONSTRAINTS) {
    const existing = constraintNames(await qi.showConstraint(table));
    if (existing.has(constraintName.toLowerCase())) continue; // already present
    try {
      await qi.addConstraint(table, {
        fields: [column],
        type: "foreign key",
        name: constraintName,
        references,
        onUpdate: "CASCADE",
        onDelete: "NO ACTION",
      });
    } catch (error) {
      if (!isMissingConstraintError(error)) throw error;
    }
  }
}

export default { name, up, down };
