import { tableName } from "../tableName.js";

export const INTEGRATION_WEBHOOK_PROVIDERS = ["REPLI"];
export const INTEGRATION_WEBHOOK_EVENT_STATUSES = [
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "IGNORED",
];

/**
 * Generic audit + idempotency ledger for inbound third-party integration
 * webhooks (currently Repli → Birthwave). One row per provider delivery.
 * UNIQUE(provider, delivery_id) is what makes webhook ingestion idempotent
 * against provider retries.
 */
const definition = (Sequelize) => ({
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  provider: { type: Sequelize.STRING(30), allowNull: false },
  client_id: {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: { model: tableName.CLIENTS, key: "id" },
  },
  event_type: { type: Sequelize.STRING(60), allowNull: true },
  delivery_id: { type: Sequelize.STRING(191), allowNull: false },
  status: {
    type: Sequelize.STRING(20),
    allowNull: false,
    defaultValue: "RECEIVED",
  },
  payload: { type: Sequelize.JSON, allowNull: true },
  error_message: { type: Sequelize.STRING(1000), allowNull: true },
  received_at: { type: Sequelize.DATE, allowNull: true },
  processed_at: { type: Sequelize.DATE, allowNull: true },
});

export const buildIntegrationWebhookEventCreateTableDefinition = (
  Sequelize,
  sequelize,
) => {
  const columns = definition(Sequelize);
  return {
    ...columns,
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
    },
  };
};

export const IntegrationWebhookEventTable = (Sequelize, sequelize) =>
  sequelize.define(
    "IntegrationWebhookEvent",
    definition(Sequelize),
    {
      tableName: tableName.INTEGRATION_WEBHOOK_EVENTS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          name: "uq_integration_webhook_provider_delivery",
          unique: true,
          fields: ["provider", "delivery_id"],
        },
        {
          name: "idx_integration_webhook_client_provider",
          fields: ["client_id", "provider"],
        },
        { name: "idx_integration_webhook_status", fields: ["status"] },
        { name: "idx_integration_webhook_created_at", fields: ["created_at"] },
      ],
    },
  );
