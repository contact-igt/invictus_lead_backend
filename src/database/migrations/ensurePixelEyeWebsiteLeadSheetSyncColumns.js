import db from "../index.js";
import { tableName } from "../tables/tableName.js";

// pixel_eye_website_leads predates Sheet mirroring. Existing rows are
// initialised as "synced" so only leads created after this migration are
// mirrored; the column default is then flipped to "pending" for new rows.
export const ensurePixelEyeWebsiteLeadSheetSyncColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const table = tableName.PIXELEYE_WEBSITE_LEADS;

  try {
    const columns = await queryInterface.describeTable(table);
    const has = (name) => Object.prototype.hasOwnProperty.call(columns, name);

    if (!has("source_key")) {
      await queryInterface.addColumn(table, "source_key", { type: db.Sequelize.STRING(64), allowNull: true });
    }
    if (!has("sheet_sync_status")) {
      await queryInterface.addColumn(table, "sheet_sync_status", {
        type: db.Sequelize.STRING(16), allowNull: false, defaultValue: "synced",
      });
    }
    if (!has("sheet_sync_attempts")) {
      await queryInterface.addColumn(table, "sheet_sync_attempts", {
        type: db.Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0,
      });
    }
    if (!has("sheet_sync_last_error")) {
      await queryInterface.addColumn(table, "sheet_sync_last_error", { type: db.Sequelize.TEXT, allowNull: true });
    }
    if (!has("sheet_synced_at")) {
      await queryInterface.addColumn(table, "sheet_synced_at", { type: db.Sequelize.DATE, allowNull: true });
    }
    if (!has("sheet_sync_next_attempt_at")) {
      await queryInterface.addColumn(table, "sheet_sync_next_attempt_at", { type: db.Sequelize.DATE, allowNull: true });
    }

    await queryInterface.changeColumn(table, "sheet_sync_status", {
      type: db.Sequelize.STRING(16), allowNull: false, defaultValue: "pending",
    });

    const indexName = "idx_pixel_eye_website_leads_sheet_sync";
    const indexes = await queryInterface.showIndex(table);
    if (!indexes.some((idx) => idx.name === indexName)) {
      await queryInterface.addIndex(table, { fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"], name: indexName });
    }
  } catch (error) {
    // Table missing: sequelize.sync() creates it with all columns from the model.
  }

  return true;
};

export default ensurePixelEyeWebsiteLeadSheetSyncColumns;
