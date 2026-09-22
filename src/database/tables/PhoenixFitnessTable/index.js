import { tableName } from "../tableName.js";

export const PhoenixFitnessTable = (Sequelize, sequelize) =>
  sequelize.define(
    "PhoenixFitness",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      name: { type: Sequelize.STRING(150), allowNull: false },
      mobile_number: { type: Sequelize.STRING(20), allowNull: false },
      branch: { type: Sequelize.STRING(255), allowNull: true },
      ip_address: { type: Sequelize.STRING(45), allowNull: true },
      utm_source: { type: Sequelize.STRING(255), allowNull: true },
      sheet_sync_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "pending" },
      sheet_sync_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      sheet_sync_last_error: { type: Sequelize.TEXT, allowNull: true },
      sheet_synced_at: { type: Sequelize.DATE, allowNull: true },
      sheet_sync_next_attempt_at: { type: Sequelize.DATE, allowNull: true },
    },
    {
      tableName: tableName.PHOENIX_FITNESS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_phoenix_fitness_client_id", fields: ["client_id"] },
        { name: "idx_phoenix_fitness_mobile_number", fields: ["mobile_number"] },
        { name: "idx_phoenix_fitness_created_at", fields: ["created_at"] },
        { name: "idx_phoenix_fitness_client_mobile", fields: ["client_id", "mobile_number"] },
        { name: "idx_phoenix_fitness_sheet_sync", fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"] },
      ],
    },
  );
