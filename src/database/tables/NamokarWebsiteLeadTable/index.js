import { tableName } from "../tableName.js";

export const NamokarWebsiteLeadTable = (Sequelize, sequelize) => sequelize.define("NamokarWebsiteLead", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
  submission_id: { type: Sequelize.STRING(100), allowNull: false },
  form_id: { type: Sequelize.STRING(100), allowNull: false },
  name: { type: Sequelize.STRING(120), allowNull: false }, phone: { type: Sequelize.STRING(20), allowNull: false }, email: { type: Sequelize.STRING(254), allowNull: true },
  service: { type: Sequelize.STRING(120), allowNull: false }, message: { type: Sequelize.TEXT, allowNull: true },
  referral_code: { type: Sequelize.STRING(40), allowNull: true }, consent: { type: Sequelize.BOOLEAN, allowNull: false },
  page_url: { type: Sequelize.STRING(500), allowNull: true }, status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "new" },
  pulseos_status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "pending" }, pulseos_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, pulseos_error: { type: Sequelize.STRING(80), allowNull: true }, pulseos_synced_at: { type: Sequelize.DATE, allowNull: true },
  sheet_sync_status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "pending" }, sheet_sync_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, sheet_sync_error: { type: Sequelize.STRING(80), allowNull: true }, sheet_synced_at: { type: Sequelize.DATE, allowNull: true },
}, { tableName: tableName.NAMOKAR_WEBSITE_LEADS, freezeTableName: true, timestamps: true, createdAt: "created_at", updatedAt: "updated_at", indexes: [{ unique: true, fields: ["client_id", "submission_id"] }, { fields: ["client_id", "created_at"] }, { fields: ["pulseos_status"] }, { fields: ["sheet_sync_status"] }] });
