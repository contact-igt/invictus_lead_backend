import { tableName } from "../tableName.js";

export const PixelEyeWebsiteLeadTable = (Sequelize, sequelize) => {
  return sequelize.define(
    "PixelEyeWebsiteLead",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: tableName.CLIENTS,
          key: "id",
        },
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      mobile_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      service: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      utm_source: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Which landing page the lead came from (cataract, lasik, ...). Drives
      // which Google Sheet the backend mirrors it to.
      source_key: { type: Sequelize.STRING(64), allowNull: true },
      sheet_sync_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'pending' },
      sheet_sync_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      sheet_sync_last_error: { type: Sequelize.TEXT, allowNull: true },
      sheet_synced_at: { type: Sequelize.DATE, allowNull: true },
      sheet_sync_next_attempt_at: { type: Sequelize.DATE, allowNull: true },

      // Main website appointment-enquiry fields. The older landing-page lead
      // fields above remain supported for backwards compatibility.
      form_name: { type: Sequelize.STRING(100), allowNull: true },
      lead_type: { type: Sequelize.STRING(100), allowNull: true },
      lead_status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "new" },
      email: { type: Sequelize.STRING(255), allowNull: true },
      country_calling_code: { type: Sequelize.STRING(8), allowNull: true },
      mobile_e164: { type: Sequelize.STRING(24), allowNull: true },
      hospital_location: { type: Sequelize.STRING(100), allowNull: true },
      appointment_date: { type: Sequelize.DATEONLY, allowNull: true },
      appointment_time_slot: { type: Sequelize.STRING(64), allowNull: true },
      symptom_or_condition: { type: Sequelize.STRING(255), allowNull: true },
      symptom_details: { type: Sequelize.TEXT, allowNull: true },
      terms_accepted: { type: Sequelize.BOOLEAN, allowNull: true },
      whatsapp_updates_opt_in: { type: Sequelize.BOOLEAN, allowNull: true },
      marketing_contact_consent: { type: Sequelize.BOOLEAN, allowNull: true },
      source_page_url: { type: Sequelize.STRING(2048), allowNull: true },
      referrer_url: { type: Sequelize.STRING(2048), allowNull: true },
      utm_medium: { type: Sequelize.STRING(255), allowNull: true },
      utm_campaign: { type: Sequelize.STRING(255), allowNull: true },
      utm_term: { type: Sequelize.STRING(255), allowNull: true },
      utm_content: { type: Sequelize.STRING(255), allowNull: true },
      dedupe_key: { type: Sequelize.STRING(128), allowNull: true },
      raw_submission_json: { type: Sequelize.JSON, allowNull: true },
    },
    {
      tableName: tableName.PIXELEYE_WEBSITE_LEADS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          name: "idx_pixel_eye_website_leads_client_id",
          fields: ["client_id"],
        },
        {
          name: "idx_pixel_eye_website_leads_mobile_number",
          fields: ["mobile_number"],
        },
        {
          name: "idx_pixel_eye_website_leads_created_at",
          fields: ["created_at"],
        },
        {
          name: "idx_pixel_eye_website_leads_client_mobile",
          fields: ["client_id", "mobile_number"],
        },
        {
          name: 'idx_pixel_eye_website_leads_sheet_sync',
          fields: ['sheet_sync_status', 'sheet_sync_next_attempt_at'],
        },
        {
          name: 'idx_pixel_eye_website_leads_client_dedupe',
          fields: ['client_id', 'dedupe_key'],
        },
      ],
    },
  );
};
