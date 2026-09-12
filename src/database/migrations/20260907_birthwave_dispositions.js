const DISPOSITIONS = "birthwave_dispositions";
const LEADS = "birthwave_leads";
const TASKS = "birthwave_tasks";
const MANAGEMENT = "managements";

const names = (rows) => new Set(rows.map((row) => String(row.name || "").toLowerCase()));
const constraintNames = (rows) => new Set(rows.map((row) => String(row.constraintName || row.name || "").toLowerCase()));
const createIfMissing = async (qi, table, definition) => {
  const tables = new Set((await qi.showAllTables()).map((name) => String(name).toLowerCase()));
  if (!tables.has(table)) await qi.createTable(table, definition);
};
const addIndexIfMissing = async (qi, table, fields, options) => {
  if (!names(await qi.showIndex(table)).has(options.name.toLowerCase())) await qi.addIndex(table, fields, options);
};
const addForeignKeyIfMissing = async (qi, table, fields, name, references, onDelete = "RESTRICT") => {
  if (!constraintNames(await qi.showConstraint(table)).has(name.toLowerCase())) {
    await qi.addConstraint(table, { fields, type: "foreign key", name, references, onUpdate: "CASCADE", onDelete });
  }
};

export const name = "20260907_birthwave_dispositions";

export async function up({ context: qi, Sequelize }) {
  await createIfMissing(qi, DISPOSITIONS, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    lead_id: { type: Sequelize.INTEGER, allowNull: false },
    task_id: { type: Sequelize.INTEGER, allowNull: false },
    call_id: { type: Sequelize.INTEGER, allowNull: true },
    evidence_source: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "MANUAL_TASK" },
    contact_result: { type: Sequelize.STRING(24), allowNull: false },
    not_reached_reason: { type: Sequelize.STRING(32), allowNull: true },
    disposition: { type: Sequelize.STRING(40), allowNull: true },
    notes: { type: Sequelize.TEXT, allowNull: true },
    next_action_type: { type: Sequelize.STRING(32), allowNull: true },
    next_action_due_at: { type: Sequelize.DATE, allowNull: true },
    appointment_id: { type: Sequelize.INTEGER, allowNull: true },
    lost_reason: { type: Sequelize.STRING(64), allowNull: true },
    outcome_event_id: { type: Sequelize.STRING(191), allowNull: false },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });
  await addIndexIfMissing(qi, DISPOSITIONS, ["client_id", "outcome_event_id"], { name: "uq_bw_dispositions_event", unique: true });
  await addIndexIfMissing(qi, DISPOSITIONS, ["client_id", "lead_id", "created_at"], { name: "idx_bw_dispositions_lead_created" });
  await addIndexIfMissing(qi, DISPOSITIONS, ["client_id", "task_id"], { name: "idx_bw_dispositions_task" });
  await addForeignKeyIfMissing(qi, DISPOSITIONS, ["client_id"], "fk_bw_dispositions_client", { table: "clients", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, DISPOSITIONS, ["lead_id"], "fk_bw_dispositions_lead", { table: LEADS, field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, DISPOSITIONS, ["task_id"], "fk_bw_dispositions_task", { table: TASKS, field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, DISPOSITIONS, ["created_by"], "fk_bw_dispositions_created_by", { table: MANAGEMENT, field: "id" }, "SET NULL");
}

export async function down({ context: qi }) {
  for (const constraint of ["fk_bw_dispositions_created_by", "fk_bw_dispositions_task", "fk_bw_dispositions_lead", "fk_bw_dispositions_client"]) {
    try { await qi.removeConstraint(DISPOSITIONS, constraint); } catch (error) {
      if (!/doesn't exist|does not exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  }
  try { await qi.dropTable(DISPOSITIONS); } catch (error) {
    if (!/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error;
  }
}

export default { name, up, down };
