const ATTENTION = "birthwave_attention_items";
const names = (rows) => new Set(rows.map((row) => String(row.name || "").toLowerCase()));
const constraints = (rows) => new Set(rows.map((row) => String(row.constraintName || row.name || "").toLowerCase()));
const createIfMissing = async (qi, table, definition) => { const tables = new Set((await qi.showAllTables()).map((name) => String(name).toLowerCase())); if (!tables.has(table)) await qi.createTable(table, definition); };
const indexIfMissing = async (qi, table, fields, options) => { if (!names(await qi.showIndex(table)).has(options.name.toLowerCase())) await qi.addIndex(table, fields, options); };
const fkIfMissing = async (qi, table, fields, name, references, onDelete = "SET NULL") => { if (!constraints(await qi.showConstraint(table)).has(name.toLowerCase())) await qi.addConstraint(table, { fields, type: "foreign key", name, references, onUpdate: "CASCADE", onDelete }); };

export const name = "20260907_birthwave_attention_items";
export async function up({ context: qi, Sequelize }) {
  await createIfMissing(qi, ATTENTION, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false }, client_id: { type: Sequelize.INTEGER, allowNull: false }, lead_id: { type: Sequelize.INTEGER, allowNull: true }, task_id: { type: Sequelize.INTEGER, allowNull: true }, team_id: { type: Sequelize.INTEGER, allowNull: true }, owner_id: { type: Sequelize.INTEGER, allowNull: true }, attention_type: { type: Sequelize.STRING(40), allowNull: false }, status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "OPEN" }, severity: { type: Sequelize.STRING(12), allowNull: false, defaultValue: "NORMAL" }, title: { type: Sequelize.STRING(180), allowNull: false }, description: { type: Sequelize.TEXT, allowNull: true }, detected_at: { type: Sequelize.DATE, allowNull: false }, acknowledged_at: { type: Sequelize.DATE, allowNull: true }, acknowledged_by: { type: Sequelize.INTEGER, allowNull: true }, resolved_at: { type: Sequelize.DATE, allowNull: true }, resolved_by: { type: Sequelize.INTEGER, allowNull: true }, resolution_note: { type: Sequelize.TEXT, allowNull: true }, dedupe_key: { type: Sequelize.STRING(191), allowNull: false }, metadata: { type: Sequelize.JSON, allowNull: true }, created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });
  await indexIfMissing(qi, ATTENTION, ["client_id", "dedupe_key"], { name: "uq_bw_attention_dedupe", unique: true });
  await indexIfMissing(qi, ATTENTION, ["client_id", "status", "detected_at"], { name: "idx_bw_attention_status_detected" });
  await indexIfMissing(qi, ATTENTION, ["client_id", "team_id", "status"], { name: "idx_bw_attention_team_status" });
  await indexIfMissing(qi, ATTENTION, ["client_id", "lead_id", "status"], { name: "idx_bw_attention_lead" });
  await indexIfMissing(qi, ATTENTION, ["client_id", "task_id", "status"], { name: "idx_bw_attention_task" });
  await fkIfMissing(qi, ATTENTION, ["client_id"], "fk_bw_attention_client", { table: "clients", field: "id" }, "CASCADE");
  await fkIfMissing(qi, ATTENTION, ["lead_id"], "fk_bw_attention_lead", { table: "birthwave_leads", field: "id" });
  await fkIfMissing(qi, ATTENTION, ["task_id"], "fk_bw_attention_task", { table: "birthwave_tasks", field: "id" });
  await fkIfMissing(qi, ATTENTION, ["team_id"], "fk_bw_attention_team", { table: "birthwave_teams", field: "id" });
  await fkIfMissing(qi, ATTENTION, ["owner_id"], "fk_bw_attention_owner", { table: "managements", field: "id" });
  await fkIfMissing(qi, ATTENTION, ["acknowledged_by"], "fk_bw_attention_ack_by", { table: "managements", field: "id" });
  await fkIfMissing(qi, ATTENTION, ["resolved_by"], "fk_bw_attention_resolved_by", { table: "managements", field: "id" });
}
export async function down({ context: qi }) { for (const key of ["fk_bw_attention_resolved_by", "fk_bw_attention_ack_by", "fk_bw_attention_owner", "fk_bw_attention_team", "fk_bw_attention_task", "fk_bw_attention_lead", "fk_bw_attention_client"]) { try { await qi.removeConstraint(ATTENTION, key); } catch (error) { if (!/doesn't exist|does not exist|unknown|not found/i.test(error?.message || "")) throw error; } } try { await qi.dropTable(ATTENTION); } catch (error) { if (!/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error; } }
export default { name, up, down };
