import db from "../index.js";
import { tableName } from "../tables/tableName.js";

// Existing rows predate Sheet synchronization, so initialize them as
// "synced" instead of retrying the full history and creating duplicate rows
// in the Google Sheet — only leads created after this migration runs get
// mirrored.
export const ensureRioSheetSyncColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();

  const ensureSheetSyncColumns = async (table) => {
    try {
      const columns = await queryInterface.describeTable(table);
      const statusWasMissing = !Object.prototype.hasOwnProperty.call(columns, "sheet_sync_status");

      if (statusWasMissing) {
        await queryInterface.addColumn(table, "sheet_sync_status", {
          type: db.Sequelize.STRING(16),
          allowNull: false,
          defaultValue: "synced",
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_attempts")) {
        await queryInterface.addColumn(table, "sheet_sync_attempts", {
          type: db.Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_last_error")) {
        await queryInterface.addColumn(table, "sheet_sync_last_error", {
          type: db.Sequelize.TEXT,
          allowNull: true,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_synced_at")) {
        await queryInterface.addColumn(table, "sheet_synced_at", {
          type: db.Sequelize.DATE,
          allowNull: true,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_next_attempt_at")) {
        await queryInterface.addColumn(table, "sheet_sync_next_attempt_at", {
          type: db.Sequelize.DATE,
          allowNull: true,
        });
      }

      // New rows default to "pending" so they actually get synced; only
      // flip the column default after backfilling existing rows as "synced"
      // above (statusWasMissing branch already inserted them as "synced").
      await queryInterface.changeColumn(table, "sheet_sync_status", {
        type: db.Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "pending",
      });

      try {
        const existingIndexes = await queryInterface.showIndex(table);
        const indexName = `idx_${table}_sheet_sync`;
        if (!existingIndexes.some((idx) => idx.name === indexName)) {
          await queryInterface.addIndex(table, {
            fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"],
            name: indexName,
          });
        }
      } catch (err) {
        // Non-fatal — the retry query still works without the index.
      }
    } catch (err) {
      // Table may not exist yet; sequelize.sync() will create it with all columns.
    }
  };

  await ensureSheetSyncColumns(tableName.RIO);
  await ensureSheetSyncColumns(tableName.RIO_VACCINE_CHART);

  return true;
};

export default ensureRioSheetSyncColumns;
