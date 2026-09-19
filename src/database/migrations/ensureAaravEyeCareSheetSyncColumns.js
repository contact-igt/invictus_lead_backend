import db from "../index.js";
import { tableName } from "../tables/tableName.js";

// Existing rows predate Sheet synchronization, so initialize them as
// "synced" instead of retrying the full history and creating duplicate rows
// in the Google Sheet — only leads created after this migration runs get
// mirrored.
export const ensureAaravEyeCareSheetSyncColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const table = tableName.AARAV_EYE_CARE;

  try {
    const columns = await queryInterface.describeTable(table);

    if (!Object.prototype.hasOwnProperty.call(columns, "message")) {
      await queryInterface.addColumn(table, "message", {
        type: db.Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!Object.prototype.hasOwnProperty.call(columns, "source")) {
      await queryInterface.addColumn(table, "source", {
        type: db.Sequelize.STRING(255),
        allowNull: true,
      });
    }

    const statusWasMissing = !Object.prototype.hasOwnProperty.call(
      columns,
      "sheet_sync_status",
    );

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

    if (
      !Object.prototype.hasOwnProperty.call(columns, "sheet_sync_next_attempt_at")
    ) {
      await queryInterface.addColumn(table, "sheet_sync_next_attempt_at", {
        type: db.Sequelize.DATE,
        allowNull: true,
      });
    }

    // New rows default to "pending" so they actually get synced
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
      // Non-fatal — index failure shouldn't stop migration
    }
  } catch (err) {
    // Table may not exist yet; sequelize.sync() will create it with all columns.
  }

  try {
    if (db.Client) {
      await db.Client.findOrCreate({
        where: { client_key: "aarav_eye_care" },
        defaults: {
          name: "Aarav Eye Care",
          client_key: "aarav_eye_care",
        },
      });
    }
  } catch (err) {
    // Non-fatal if clients table is not synced yet
  }

  return true;
};

export default ensureAaravEyeCareSheetSyncColumns;
