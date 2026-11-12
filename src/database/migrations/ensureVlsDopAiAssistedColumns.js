import db from "../index.js";
import { tableName } from "../tables/tableName.js";

export const ensureVlsDopAiAssistedColumns = async () => {
  let queryInterface;
  let columns;

  try {
    queryInterface = db.sequelize.getQueryInterface();
    columns = await queryInterface.describeTable(tableName.VLS_DOP_AI_ASSISTED);
  } catch (error) {
    // On a new installation sequelize.sync() creates the table and its fields.
    if (/doesn't exist|no such table|no description found/i.test(error.message)) return;
    throw error;
  }

  try {
    if (!columns.who_are_you) {
      await queryInterface.addColumn(tableName.VLS_DOP_AI_ASSISTED, "who_are_you", {
        type: db.Sequelize.STRING(100),
        allowNull: true,
      });
    }
    if (!columns.why_join) {
      await queryInterface.addColumn(tableName.VLS_DOP_AI_ASSISTED, "why_join", {
        type: db.Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!columns.attending) {
      await queryInterface.addColumn(tableName.VLS_DOP_AI_ASSISTED, "attending", {
        type: db.Sequelize.STRING(10),
        allowNull: true,
      });
    }
    const syncColumns = {
      sheet_sync_status: { type: db.Sequelize.STRING(20), allowNull: false, defaultValue: "pending" },
      sheet_sync_attempts: { type: db.Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      sheet_sync_last_error: { type: db.Sequelize.STRING(1000), allowNull: true },
      sheet_synced_at: { type: db.Sequelize.DATE, allowNull: true },
      sheet_sync_next_attempt_at: { type: db.Sequelize.DATE, allowNull: true },
    };
    for (const [name, definition] of Object.entries(syncColumns)) {
      if (!columns[name]) await queryInterface.addColumn(tableName.VLS_DOP_AI_ASSISTED, name, definition);
    }
  } catch (error) {
    throw new Error(`Could not update DOP AI Assisted columns: ${error.message}`);
  }
};
