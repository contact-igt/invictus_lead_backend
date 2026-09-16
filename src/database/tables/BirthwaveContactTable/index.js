import { tableName } from "../tableName.js";

export const BIRTHWAVE_CONTACT_STATUSES = ["active", "merged", "archived"];

export const BirthwaveContactTable = (Sequelize, sequelize) =>
  sequelize.define(
    "BirthwaveContact",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      display_name: { type: Sequelize.STRING(150), allowNull: false },
      normalized_phone: { type: Sequelize.STRING(32), allowNull: true },
      normalized_email: { type: Sequelize.STRING(200), allowNull: true },
      status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: "active" },
    },
    {
      tableName: tableName.BIRTHWAVE_CONTACTS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_bw_contacts_client_status", fields: ["client_id", "status"] },
        { name: "uq_bw_contacts_client_phone", unique: true, fields: ["client_id", "normalized_phone"] },
        { name: "uq_bw_contacts_client_email", unique: true, fields: ["client_id", "normalized_email"] },
        { name: "idx_bw_contacts_client_created", fields: ["client_id", "created_at"] },
      ],
    },
  );
