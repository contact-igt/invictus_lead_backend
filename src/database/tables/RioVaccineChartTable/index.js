import { tableName } from "../tableName.js";

export const RioVaccineChartTable = (Sequelize, sequelize) => sequelize.define(
  "RioVaccineChart",
  {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
    registration_number: { type: Sequelize.STRING(8), allowNull: false },
    parent_name: { type: Sequelize.STRING(150), allowNull: false },
    child_name: { type: Sequelize.STRING(150), allowNull: false },
    phone: { type: Sequelize.STRING(20), allowNull: false },
    dob: { type: Sequelize.DATEONLY, allowNull: false },
    gender: { type: Sequelize.STRING(10), allowNull: true },
    ip_address: { type: Sequelize.STRING(45), allowNull: true },
    utm_source: { type: Sequelize.STRING(255), allowNull: true },
    sheet_sync_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "pending" },
    sheet_sync_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    sheet_sync_last_error: { type: Sequelize.TEXT, allowNull: true },
    sheet_synced_at: { type: Sequelize.DATE, allowNull: true },
    sheet_sync_next_attempt_at: { type: Sequelize.DATE, allowNull: true },
  },
  {
    tableName: tableName.RIO_VACCINE_CHART,
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { name: "idx_rio_vaccine_chart_client_id", fields: ["client_id"] },
      { name: "idx_rio_vaccine_chart_registration_number", fields: ["registration_number"] },
      { name: "idx_rio_vaccine_chart_phone", fields: ["phone"] },
      { name: "idx_rio_vaccine_chart_created_at", fields: ["created_at"] },
      { name: "idx_rio_vaccine_chart_sheet_sync", fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"] },
    ],
  },
);
