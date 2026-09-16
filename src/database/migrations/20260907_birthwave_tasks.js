const TASKS = "birthwave_tasks";
const LEADS = "birthwave_leads";
const TEAMS = "birthwave_teams";
const MANAGEMENT = "managements";

const names = (rows) => new Set(rows.map((row) => String(row.name || "").toLowerCase()));
const constraintNames = (rows) => new Set(rows.map((row) => String(row.constraintName || row.name || "").toLowerCase()));

const createIfMissing = async (qi, table, definition) => {
  const tables = new Set((await qi.showAllTables()).map((name) => String(name).toLowerCase()));
  if (!tables.has(table)) await qi.createTable(table, definition);
};

const addIndexIfMissing = async (qi, table, fields, options) => {
  const existing = await qi.showIndex(table);
  if (!names(existing).has(options.name.toLowerCase())) await qi.addIndex(table, fields, options);
};

const addForeignKeyIfMissing = async (qi, table, fields, name, references, onDelete = "RESTRICT") => {
  const constraints = constraintNames(await qi.showConstraint(table));
  if (!constraints.has(name.toLowerCase())) {
    await qi.addConstraint(table, { fields, type: "foreign key", name, references, onUpdate: "CASCADE", onDelete });
  }
};

export const name = "20260907_birthwave_tasks";

export async function up({ context: qi, Sequelize }) {
  await createIfMissing(qi, TASKS, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    lead_id: { type: Sequelize.INTEGER, allowNull: false },
    team_id: { type: Sequelize.INTEGER, allowNull: false },
    owner_id: { type: Sequelize.INTEGER, allowNull: false },
    task_type: { type: Sequelize.STRING(40), allowNull: false },
    status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: "PENDING" },
    priority: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "NORMAL" },
    due_at: { type: Sequelize.DATE, allowNull: false },
    started_at: { type: Sequelize.DATE, allowNull: true },
    completed_at: { type: Sequelize.DATE, allowNull: true },
    cancelled_at: { type: Sequelize.DATE, allowNull: true },
    is_primary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    parent_task_id: { type: Sequelize.INTEGER, allowNull: true },
    attempt_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
    completion_reason: { type: Sequelize.STRING(500), allowNull: true },
    metadata: { type: Sequelize.JSON, allowNull: true },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    updated_by: { type: Sequelize.INTEGER, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });

  await addIndexIfMissing(qi, TASKS, ["client_id"], { name: "idx_bw_tasks_client" });
  await addIndexIfMissing(qi, TASKS, ["client_id", "lead_id"], { name: "idx_bw_tasks_lead" });
  await addIndexIfMissing(qi, TASKS, ["client_id", "owner_id", "status", "due_at"], { name: "idx_bw_tasks_owner_status_due" });
  await addIndexIfMissing(qi, TASKS, ["client_id", "team_id", "status", "due_at"], { name: "idx_bw_tasks_team_status_due" });
  await addIndexIfMissing(qi, TASKS, ["client_id", "status", "task_type", "due_at"], { name: "idx_bw_tasks_status_type_due" });
  await addIndexIfMissing(qi, TASKS, ["client_id", "lead_id", "is_primary", "status"], { name: "idx_bw_tasks_primary" });
  await addIndexIfMissing(qi, TASKS, ["client_id", "parent_task_id"], { name: "idx_bw_tasks_parent" });

  await addForeignKeyIfMissing(qi, TASKS, ["client_id"], "fk_bw_tasks_client", { table: "clients", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, TASKS, ["lead_id"], "fk_bw_tasks_lead", { table: LEADS, field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, TASKS, ["team_id"], "fk_bw_tasks_team", { table: TEAMS, field: "id" }, "RESTRICT");
  await addForeignKeyIfMissing(qi, TASKS, ["owner_id"], "fk_bw_tasks_owner", { table: MANAGEMENT, field: "id" }, "RESTRICT");
  await addForeignKeyIfMissing(qi, TASKS, ["parent_task_id"], "fk_bw_tasks_parent", { table: TASKS, field: "id" }, "RESTRICT");
  await addForeignKeyIfMissing(qi, TASKS, ["created_by"], "fk_bw_tasks_created_by", { table: MANAGEMENT, field: "id" }, "SET NULL");
  await addForeignKeyIfMissing(qi, TASKS, ["updated_by"], "fk_bw_tasks_updated_by", { table: MANAGEMENT, field: "id" }, "SET NULL");
}

export async function down({ context: qi }) {
  for (const constraint of ["fk_bw_tasks_updated_by", "fk_bw_tasks_created_by", "fk_bw_tasks_parent", "fk_bw_tasks_owner", "fk_bw_tasks_team", "fk_bw_tasks_lead", "fk_bw_tasks_client"]) {
    try { await qi.removeConstraint(TASKS, constraint); } catch (error) {
      if (!/doesn't exist|does not exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  }
  try { await qi.dropTable(TASKS); } catch (error) {
    if (!/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error;
  }
}

export default { name, up, down };
