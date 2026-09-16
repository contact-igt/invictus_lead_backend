const TEAMS = "birthwave_teams";
const MEMBERS = "birthwave_team_members";
const ASSIGNMENTS = "birthwave_lead_assignments";
const CURSORS = "birthwave_assignment_cursors";
const RULES = "birthwave_assignment_rules";
const LEADS = "birthwave_leads";

const names = (rows) => new Set(rows.map((row) => String(row.name || "").toLowerCase()));
const constraintNames = (rows) => new Set(rows.map((row) => String(row.constraintName || row.name || "").toLowerCase()));
const hasColumn = (columns, name) => Object.prototype.hasOwnProperty.call(columns, name);

const addIndexIfMissing = async (qi, table, fields, options) => {
  const existing = await qi.showIndex(table);
  if (!names(existing).has(options.name.toLowerCase())) await qi.addIndex(table, fields, options);
};

const addColumnIfMissing = async (qi, table, column, definition) => {
  const columns = await qi.describeTable(table);
  if (!hasColumn(columns, column)) await qi.addColumn(table, column, definition);
};

const addForeignKeyIfMissing = async (qi, table, fields, name, references, onDelete = "RESTRICT") => {
  const constraints = constraintNames(await qi.showConstraint(table));
  if (!constraints.has(name.toLowerCase())) {
    await qi.addConstraint(table, {
      fields,
      type: "foreign key",
      name,
      references,
      onUpdate: "CASCADE",
      onDelete,
    });
  }
};

const createIfMissing = async (qi, table, definition) => {
  const tables = new Set((await qi.showAllTables()).map((name) => String(name).toLowerCase()));
  if (!tables.has(table)) await qi.createTable(table, definition);
};

export const name = "20260907_birthwave_teams_assignment";

export async function up({ context: qi, Sequelize }) {
  await createIfMissing(qi, TEAMS, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    name: { type: Sequelize.STRING(120), allowNull: false },
    code: { type: Sequelize.STRING(80), allowNull: false },
    description: { type: Sequelize.TEXT, allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    updated_by: { type: Sequelize.INTEGER, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });
  await createIfMissing(qi, MEMBERS, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    team_id: { type: Sequelize.INTEGER, allowNull: false },
    management_id: { type: Sequelize.INTEGER, allowNull: false },
    operational_role: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "TELECALLER" },
    assignment_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "ACTIVE" },
    service_access: { type: Sequelize.JSON, allowNull: true },
    source_access: { type: Sequelize.JSON, allowNull: true },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    updated_by: { type: Sequelize.INTEGER, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });
  await createIfMissing(qi, ASSIGNMENTS, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    lead_id: { type: Sequelize.INTEGER, allowNull: false },
    team_id: { type: Sequelize.INTEGER, allowNull: false },
    owner_id: { type: Sequelize.INTEGER, allowNull: false },
    assignment_type: { type: Sequelize.STRING(32), allowNull: false },
    assigned_by: { type: Sequelize.INTEGER, allowNull: true },
    reason: { type: Sequelize.STRING(500), allowNull: true },
    is_current: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    assigned_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    ended_at: { type: Sequelize.DATE, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });
  await createIfMissing(qi, CURSORS, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    team_id: { type: Sequelize.INTEGER, allowNull: false },
    scope_key: { type: Sequelize.STRING(191), allowNull: false },
    last_member_id: { type: Sequelize.INTEGER, allowNull: true },
    version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });
  await createIfMissing(qi, RULES, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    name: { type: Sequelize.STRING(160), allowNull: false },
    priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
    service: { type: Sequelize.STRING(255), allowNull: true },
    source: { type: Sequelize.STRING(80), allowNull: true },
    team_id: { type: Sequelize.INTEGER, allowNull: false },
    assignment_method: { type: Sequelize.STRING(24), allowNull: false, defaultValue: "ROUND_ROBIN" },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });

  await addColumnIfMissing(qi, LEADS, "current_team_id", { type: Sequelize.INTEGER, allowNull: true });
  await addColumnIfMissing(qi, LEADS, "current_owner_id", { type: Sequelize.INTEGER, allowNull: true });

  await addIndexIfMissing(qi, TEAMS, ["client_id", "code"], { name: "uq_bw_teams_client_code", unique: true });
  await addIndexIfMissing(qi, TEAMS, ["client_id", "is_active"], { name: "idx_bw_teams_client_active" });
  await addIndexIfMissing(qi, MEMBERS, ["client_id", "team_id", "management_id"], { name: "uq_bw_team_members_client_team_user", unique: true });
  await addIndexIfMissing(qi, MEMBERS, ["client_id", "team_id", "status", "assignment_enabled"], { name: "idx_bw_team_members_eligible" });
  await addIndexIfMissing(qi, MEMBERS, ["client_id", "management_id", "status"], { name: "idx_bw_team_members_user" });
  await addIndexIfMissing(qi, ASSIGNMENTS, ["client_id", "lead_id", "is_current"], { name: "idx_bw_assignments_client_lead_current" });
  await addIndexIfMissing(qi, ASSIGNMENTS, ["client_id", "owner_id", "is_current"], { name: "idx_bw_assignments_client_owner_current" });
  await addIndexIfMissing(qi, ASSIGNMENTS, ["client_id", "team_id", "is_current"], { name: "idx_bw_assignments_client_team_current" });
  await addIndexIfMissing(qi, CURSORS, ["client_id", "team_id", "scope_key"], { name: "uq_bw_cursors_client_team_scope", unique: true });
  await addIndexIfMissing(qi, RULES, ["client_id", "is_active", "priority"], { name: "idx_bw_rules_client_active_priority" });
  await addIndexIfMissing(qi, RULES, ["client_id", "team_id"], { name: "idx_bw_rules_client_team" });
  await addIndexIfMissing(qi, LEADS, ["client_id", "current_team_id"], { name: "idx_bw_leads_client_team" });
  await addIndexIfMissing(qi, LEADS, ["client_id", "current_owner_id"], { name: "idx_bw_leads_client_owner" });

  await addForeignKeyIfMissing(qi, TEAMS, ["client_id"], "fk_bw_teams_client", { table: "clients", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, MEMBERS, ["client_id"], "fk_bw_team_members_client", { table: "clients", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, MEMBERS, ["team_id"], "fk_bw_team_members_team", { table: TEAMS, field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, MEMBERS, ["management_id"], "fk_bw_team_members_management", { table: "managements", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, ASSIGNMENTS, ["client_id"], "fk_bw_assignments_client", { table: "clients", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, ASSIGNMENTS, ["lead_id"], "fk_bw_assignments_lead", { table: LEADS, field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, ASSIGNMENTS, ["team_id"], "fk_bw_assignments_team", { table: TEAMS, field: "id" }, "RESTRICT");
  await addForeignKeyIfMissing(qi, ASSIGNMENTS, ["owner_id"], "fk_bw_assignments_owner", { table: "managements", field: "id" }, "RESTRICT");
  await addForeignKeyIfMissing(qi, CURSORS, ["client_id"], "fk_bw_cursors_client", { table: "clients", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, CURSORS, ["team_id"], "fk_bw_cursors_team", { table: TEAMS, field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, RULES, ["client_id"], "fk_bw_rules_client", { table: "clients", field: "id" }, "CASCADE");
  await addForeignKeyIfMissing(qi, RULES, ["team_id"], "fk_bw_rules_team", { table: TEAMS, field: "id" }, "RESTRICT");
  await addForeignKeyIfMissing(qi, LEADS, ["current_team_id"], "fk_bw_leads_current_team", { table: TEAMS, field: "id" }, "SET NULL");
  await addForeignKeyIfMissing(qi, LEADS, ["current_owner_id"], "fk_bw_leads_current_owner", { table: "managements", field: "id" }, "SET NULL");
}

export async function down({ context: qi }) {
  const removeConstraint = async (table, constraint) => {
    try { await qi.removeConstraint(table, constraint); } catch (error) {
      if (!/doesn't exist|does not exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  };
  for (const [table, constraint] of [
    [LEADS, "fk_bw_leads_current_owner"], [LEADS, "fk_bw_leads_current_team"],
    [RULES, "fk_bw_rules_team"], [RULES, "fk_bw_rules_client"],
    [CURSORS, "fk_bw_cursors_team"], [CURSORS, "fk_bw_cursors_client"],
    [ASSIGNMENTS, "fk_bw_assignments_owner"], [ASSIGNMENTS, "fk_bw_assignments_team"], [ASSIGNMENTS, "fk_bw_assignments_lead"], [ASSIGNMENTS, "fk_bw_assignments_client"],
    [MEMBERS, "fk_bw_team_members_management"], [MEMBERS, "fk_bw_team_members_team"], [MEMBERS, "fk_bw_team_members_client"],
    [TEAMS, "fk_bw_teams_client"],
  ]) await removeConstraint(table, constraint);
  // Child-table indexes are removed with their tables below. Removing the
  // Team unique index first can fail in MySQL because it is also used as an
  // implicit supporting index for a foreign key.
  for (const column of ["current_owner_id", "current_team_id"]) {
    try { await qi.removeColumn(LEADS, column); } catch (error) {
      if (!/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  }
  for (const table of [RULES, CURSORS, ASSIGNMENTS, MEMBERS, TEAMS]) {
    try { await qi.dropTable(table); } catch (error) {
      if (!/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  }
}

export default { name, up, down };
