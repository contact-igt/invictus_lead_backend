import { tableName } from "../tableName.js";

export const CrmFieldMappingTable = (Sequelize, sequelize) =>
  sequelize.define(
    "CrmFieldMapping",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      provider: { type: Sequelize.STRING(30), allowNull: false },
      external_field: { type: Sequelize.STRING(150), allowNull: false },
      target_type: { type: Sequelize.STRING(15), allowNull: false, defaultValue: "standard" },
      target_field: { type: Sequelize.STRING(80), allowNull: false },
    },
    {
      tableName: tableName.CRM_FIELD_MAPPINGS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_crm_mappings_client_provider", fields: ["client_id", "provider"] },
        {
          name: "uq_crm_mappings_client_provider_ext",
          unique: true,
          fields: ["client_id", "provider", "external_field"],
        },
      ],
    },
  );
