import { tableName } from "../tableName.js";

// One deployment (website or landing page) per source_key. Labels live in the
// admin frontend; the backend only needs the stable keys.
export const BIRTHWAVE_WEBSITE_SOURCE_KEYS = [
  "birthwave_website",
  "birthwave_normalbirth",
  "birthwave_naturalbirth",
  "birthwave_pregnancycare",
  "birthwave_vbac",
];

export const BIRTHWAVE_WEBSITE_LEAD_STATUSES = [
  "New",
  "Contacted",
  "In Progress",
  "Converted",
  "Closed",
];

export const SHEET_SYNC_STATUSES = ["pending", "synced", "failed"];

export const BirthwaveWebsiteLeadTable = (Sequelize, sequelize) =>
  sequelize.define(
    "BirthwaveWebsiteLead",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      source_key: { type: Sequelize.STRING(40), allowNull: false },
      external_lead_id: { type: Sequelize.STRING(64), allowNull: true },

      // Core enquiry
      name: { type: Sequelize.STRING(150), allowNull: false },
      phone: { type: Sequelize.STRING(30), allowNull: false },
      email: { type: Sequelize.STRING(200), allowNull: true },
      service: { type: Sequelize.STRING(160), allowNull: true },
      message: { type: Sequelize.TEXT, allowNull: true },
      consent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

      // Attribution
      source: { type: Sequelize.STRING(120), allowNull: true },
      campaign: { type: Sequelize.STRING(160), allowNull: true },
      creative: { type: Sequelize.STRING(160), allowNull: true },
      channel: { type: Sequelize.STRING(40), allowNull: true, defaultValue: "Form" },
      landing_page: { type: Sequelize.STRING(255), allowNull: true },
      referrer: { type: Sequelize.STRING(500), allowNull: true },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      utm_source: { type: Sequelize.STRING(160), allowNull: true },
      utm_medium: { type: Sequelize.STRING(160), allowNull: true },
      utm_campaign: { type: Sequelize.STRING(160), allowNull: true },
      utm_content: { type: Sequelize.STRING(160), allowNull: true },
      utm_term: { type: Sequelize.STRING(160), allowNull: true },
      gclid: { type: Sequelize.STRING(255), allowNull: true },
      fbclid: { type: Sequelize.STRING(255), allowNull: true },

      // Lifecycle (admin-managed)
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "New" },
      notes: { type: Sequelize.TEXT, allowNull: true },
      // When an admin promotes this enquiry into a CRM lead.
      birthwave_lead_id: { type: Sequelize.INTEGER, allowNull: true },

      // Google Sheet mirror (handled server-side, retried up to 3 times)
      sheet_sync_status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "pending",
      },
      sheet_sync_attempts: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      sheet_sync_last_error: { type: Sequelize.TEXT, allowNull: true },
      sheet_synced_at: { type: Sequelize.DATE, allowNull: true },
      sheet_sync_next_attempt_at: { type: Sequelize.DATE, allowNull: true },
    },
    {
      tableName: tableName.BIRTHWAVE_WEBSITE_LEADS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_bw_web_leads_client", fields: ["client_id"] },
        { name: "idx_bw_web_leads_client_source", fields: ["client_id", "source_key"] },
        { name: "idx_bw_web_leads_client_status", fields: ["client_id", "status"] },
        { name: "idx_bw_web_leads_created", fields: ["client_id", "created_at"] },
        { name: "idx_bw_web_leads_phone", fields: ["phone"] },
        {
          name: "idx_bw_web_leads_sheet_sync",
          fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"],
        },
      ],
    },
  );
