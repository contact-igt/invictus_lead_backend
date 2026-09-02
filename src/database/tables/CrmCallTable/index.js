import { tableName } from "../tableName.js";

export const CrmCallTable = (Sequelize, sequelize) =>
  sequelize.define(
    "CrmCall",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      lead_id: { type: Sequelize.INTEGER, allowNull: true },
      provider: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "manual" },
      external_call_id: { type: Sequelize.STRING(191), allowNull: false },
      phone_number: { type: Sequelize.STRING(30), allowNull: true },
      normalized_phone_number: { type: Sequelize.STRING(30), allowNull: true },
      direction: { type: Sequelize.STRING(15), allowNull: true },
      status: { type: Sequelize.STRING(30), allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      duration_seconds: { type: Sequelize.INTEGER, allowNull: true },
      agent_name: { type: Sequelize.STRING(150), allowNull: true },
      recording_url: { type: Sequelize.STRING(500), allowNull: true },
      outcome: { type: Sequelize.STRING(50), allowNull: true },
      raw_payload: { type: Sequelize.JSON, allowNull: true },
    },
    {
      tableName: tableName.CRM_CALLS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_crm_calls_client_started", fields: ["client_id", "started_at"] },
        { name: "idx_crm_calls_client_provider", fields: ["client_id", "provider"] },
        { name: "idx_crm_calls_lead", fields: ["lead_id"] },
        {
          name: "uq_crm_calls_client_provider_ext",
          unique: true,
          fields: ["client_id", "provider", "external_call_id"],
        },
      ],
    },
  );
