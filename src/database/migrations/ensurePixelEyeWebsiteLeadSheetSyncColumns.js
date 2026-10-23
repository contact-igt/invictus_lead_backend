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

    const appointmentColumns = {
      form_name: { type: db.Sequelize.STRING(100), allowNull: true },
      lead_type: { type: db.Sequelize.STRING(100), allowNull: true },
      lead_status: { type: db.Sequelize.STRING(40), allowNull: false, defaultValue: "new" },
      email: { type: db.Sequelize.STRING(255), allowNull: true },
      country_calling_code: { type: db.Sequelize.STRING(8), allowNull: true },
      mobile_e164: { type: db.Sequelize.STRING(24), allowNull: true },
      hospital_location: { type: db.Sequelize.STRING(100), allowNull: true },
      appointment_date: { type: db.Sequelize.DATEONLY, allowNull: true },
      appointment_time_slot: { type: db.Sequelize.STRING(64), allowNull: true },
      symptom_or_condition: { type: db.Sequelize.STRING(255), allowNull: true },
      symptom_details: { type: db.Sequelize.TEXT, allowNull: true },
      terms_accepted: { type: db.Sequelize.BOOLEAN, allowNull: true },
      whatsapp_updates_opt_in: { type: db.Sequelize.BOOLEAN, allowNull: true },
      marketing_contact_consent: { type: db.Sequelize.BOOLEAN, allowNull: true },
      source_page_url: { type: db.Sequelize.STRING(2048), allowNull: true },
      referrer_url: { type: db.Sequelize.STRING(2048), allowNull: true },
      utm_medium: { type: db.Sequelize.STRING(255), allowNull: true },
      utm_campaign: { type: db.Sequelize.STRING(255), allowNull: true },
      utm_term: { type: db.Sequelize.STRING(255), allowNull: true },
      utm_content: { type: db.Sequelize.STRING(255), allowNull: true },
      dedupe_key: { type: db.Sequelize.STRING(128), allowNull: true },
      raw_submission_json: { type: db.Sequelize.JSON, allowNull: true },
    };

    for (const [name, definition] of Object.entries(appointmentColumns)) {
      if (!has(name)) await queryInterface.addColumn(table, name, definition);
    }

    // Rename the original main-site marker without touching service-specific
    // landing-page sources.
    await queryInterface.bulkUpdate(
      table,
      { source_key: "pixel_eye_hospital" },
      { source_key: "main_website" },
    );

    const dedupeIndex = "idx_pixel_eye_website_leads_client_dedupe";
    const updatedIndexes = await queryInterface.showIndex(table);
    if (!updatedIndexes.some((idx) => idx.name === dedupeIndex)) {
      await queryInterface.addIndex(table, { fields: ["client_id", "dedupe_key"], name: dedupeIndex });
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
