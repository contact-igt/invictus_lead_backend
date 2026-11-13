import db from "../index.js";

// Additive only. Existing landing-page rows stay excluded from website/Runo delivery.
export const ensurePhoenixFitnessWebsiteColumns = async () => {
  const q = db.sequelize.getQueryInterface();
  const table = "phoenix_fitness_leads";
  const tables = await q.showAllTables();
  if (!tables.some((item) => (typeof item === "string" ? item : item.tableName) === table)) return;
  const columns = await q.describeTable(table);
  const fields = {
    source_provider: { type: db.Sequelize.STRING(40), allowNull: true },
    form_type: { type: db.Sequelize.STRING(40), allowNull: true },
    website_data: { type: db.Sequelize.JSON, allowNull: true },
    website_request_id: { type: db.Sequelize.STRING(36), allowNull: true },
    runo_sync_status: { type: db.Sequelize.STRING(16), allowNull: false, defaultValue: "skipped" },
    runo_sync_attempts: { type: db.Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    runo_sync_last_error: { type: db.Sequelize.STRING(100), allowNull: true },
    runo_synced_at: { type: db.Sequelize.DATE, allowNull: true },
    runo_sync_next_attempt_at: { type: db.Sequelize.DATE, allowNull: true },
  };
  for (const [name, definition] of Object.entries(fields)) if (!Object.hasOwn(columns, name)) await q.addColumn(table, name, definition);
  const indexes = await q.showIndex(table);
  for (const index of [
    { name: "idx_phoenix_website_request", unique: true, fields: ["client_id", "website_request_id"] },
    { name: "idx_phoenix_runo_sync", fields: ["runo_sync_status", "runo_sync_next_attempt_at"] },
  ]) if (!indexes.some((existing) => existing.name === index.name)) await q.addIndex(table, index.fields, { name: index.name, unique: index.unique || false });
};
