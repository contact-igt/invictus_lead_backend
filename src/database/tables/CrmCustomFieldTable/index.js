import { tableName } from "../tableName.js";

export const CRM_FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "date",
  "datetime",
  "single_select",
  "multi_select",
  "boolean",
  "email",
  "phone",
  "url",
];

export const CrmCustomFieldTable = (Sequelize, sequelize) =>
  sequelize.define(
    "CrmCustomField",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      entity_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "birthwave_lead",
      },
      field_key: { type: Sequelize.STRING(80), allowNull: false },
      label: { type: Sequelize.STRING(150), allowNull: false },
      field_type: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "text" },
      options: { type: Sequelize.JSON, allowNull: true },
      required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      show_in_form: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      show_in_detail: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      show_in_table: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      filterable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: tableName.CRM_CUSTOM_FIELDS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_crm_fields_client_entity", fields: ["client_id", "entity_type"] },
        {
          name: "uq_crm_fields_client_entity_key",
          unique: true,
          fields: ["client_id", "entity_type", "field_key"],
        },
      ],
    },
  );
