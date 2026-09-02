import { tableName } from "../tableName.js";

export const BIRTHWAVE_LEAD_STATUSES = [
  "new_lead",
  "contacted",
  "consultation_booked",
  "visited",
  "converted",
];

export const BIRTHWAVE_LEAD_SOURCES = [
  "google_ads",
  "meta_ads",
  "website",
  "whatsapp",
  "walk_in",
  "referral",
  "other",
];

export const BirthwaveLeadTable = (Sequelize, sequelize) =>
  sequelize.define(
    "BirthwaveLead",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      name: { type: Sequelize.STRING(150), allowNull: false },
      phone: { type: Sequelize.STRING(30), allowNull: false },
      email: { type: Sequelize.STRING(200), allowNull: true },
      service: { type: Sequelize.STRING(255), allowNull: true },
      source: { type: Sequelize.STRING(50), allowNull: true },
      status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: "new_lead" },
      assigned_doctor_id: { type: Sequelize.INTEGER, allowNull: true },
      next_follow_up: { type: Sequelize.DATE, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      source_provider: { type: Sequelize.STRING(50), allowNull: true },
      source_external_id: { type: Sequelize.STRING(191), allowNull: true },
      custom_fields: { type: Sequelize.JSON, allowNull: true },
    },
    {
      tableName: tableName.BIRTHWAVE_LEADS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_bw_leads_client_id", fields: ["client_id"] },
        { name: "idx_bw_leads_client_status", fields: ["client_id", "status"] },
        { name: "idx_bw_leads_client_source", fields: ["client_id", "source"] },
        { name: "idx_bw_leads_client_created", fields: ["client_id", "created_at"] },
        { name: "idx_bw_leads_client_follow_up", fields: ["client_id", "next_follow_up"] },
        { name: "idx_bw_leads_phone", fields: ["phone"] },
      ],
    },
  );
