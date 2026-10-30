import db from "../index.js";
import { tableName } from "../tables/tableName.js";

export const ensureVlsConstitutionalBootcampColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();

  try {
    const columns = await queryInterface.describeTable(tableName.VLS_CONSTITUTIONAL_BOOTCAMP);
    if (!Object.prototype.hasOwnProperty.call(columns, "current_status")) {
      await queryInterface.addColumn(tableName.VLS_CONSTITUTIONAL_BOOTCAMP, "current_status", {
        type: db.Sequelize.STRING(80),
        allowNull: true,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(columns, "city")) {
      await queryInterface.addColumn(tableName.VLS_CONSTITUTIONAL_BOOTCAMP, "city", {
        type: db.Sequelize.STRING(100),
        allowNull: true,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_status")) {
      await queryInterface.addColumn(tableName.VLS_CONSTITUTIONAL_BOOTCAMP, "sheet_sync_status", {
        type: db.Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "pending",
      });
    }
    if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_attempts")) {
      await queryInterface.addColumn(tableName.VLS_CONSTITUTIONAL_BOOTCAMP, "sheet_sync_attempts", {
        type: db.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_last_error")) {
      await queryInterface.addColumn(tableName.VLS_CONSTITUTIONAL_BOOTCAMP, "sheet_sync_last_error", {
        type: db.Sequelize.STRING(1000),
        allowNull: true,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(columns, "sheet_synced_at")) {
      await queryInterface.addColumn(tableName.VLS_CONSTITUTIONAL_BOOTCAMP, "sheet_synced_at", {
        type: db.Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_next_attempt_at")) {
      await queryInterface.addColumn(tableName.VLS_CONSTITUTIONAL_BOOTCAMP, "sheet_sync_next_attempt_at", {
        type: db.Sequelize.DATE,
        allowNull: true,
      });
    }
  } catch (error) {
    // The table is created by sequelize.sync() on a fresh installation.
  }
};
