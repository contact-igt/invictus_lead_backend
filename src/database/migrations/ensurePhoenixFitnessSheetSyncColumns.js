import db from "../index.js";

const TABLE = "phoenix_fitness_leads";

export const ensurePhoenixFitnessSheetSyncColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  try {
    const columns = await queryInterface.describeTable(TABLE);
    const fields = {
      sheet_sync_status: { type: db.Sequelize.STRING(16), allowNull: false, defaultValue: "synced" },
      sheet_sync_attempts: { type: db.Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      sheet_sync_last_error: { type: db.Sequelize.TEXT, allowNull: true },
      sheet_synced_at: { type: db.Sequelize.DATE, allowNull: true },
      sheet_sync_next_attempt_at: { type: db.Sequelize.DATE, allowNull: true },
    };
    for (const [name, definition] of Object.entries(fields)) {
      if (!Object.hasOwn(columns, name)) await queryInterface.addColumn(TABLE, name, definition);
    }
    await queryInterface.changeColumn(TABLE, "sheet_sync_status", { type: db.Sequelize.STRING(16), allowNull: false, defaultValue: "pending" });
    const indexes = await queryInterface.showIndex(TABLE);
    if (!indexes.some((index) => index.name === "idx_phoenix_fitness_sheet_sync")) {
      await queryInterface.addIndex(TABLE, ["sheet_sync_status", "sheet_sync_next_attempt_at"], { name: "idx_phoenix_fitness_sheet_sync" });
    }
  } catch {
    // The table will be created with these columns by sequelize.sync().
  }
};

export default ensurePhoenixFitnessSheetSyncColumns;
