import { tableName } from "../tableName.js";

export const CRM_PROVIDERS = ["runo", "meta", "website", "whatsapp"];
export const CRM_INTEGRATION_STATUSES = ["not_configured", "connected", "error"];

export const CrmIntegrationTable = (Sequelize, sequelize) =>
  sequelize.define(
    "CrmIntegration",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      provider: { type: Sequelize.STRING(30), allowNull: false },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "not_configured",
      },
      last_error: { type: Sequelize.STRING(500), allowNull: true },
      last_event_at: { type: Sequelize.DATE, allowNull: true },
      config: { type: Sequelize.JSON, allowNull: true },
    },
    {
      tableName: tableName.CRM_INTEGRATIONS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          name: "uq_crm_integrations_client_provider",
          unique: true,
          fields: ["client_id", "provider"],
        },
      ],
    },
  );
