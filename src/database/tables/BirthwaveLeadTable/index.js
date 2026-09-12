import { tableName } from "../tableName.js";

export const BIRTHWAVE_LEAD_STATUSES = [
  "new_lead",
  "assigned",
  "contacted",
  "consultation_booked",
  "visited",
  "converted",
];

export const BIRTHWAVE_LEAD_STAGES = [
  "NEW", "ASSIGNED", "CONTACTING", "CONTACTED", "QUALIFIED", "INTERESTED",
  "APPOINTMENT_SCHEDULED", "ATTENDED", "CONVERTED", "LOST", "INVALID",
];

export const LEGACY_STATUS_TO_STAGE = {
  new_lead: "NEW",
  assigned: "ASSIGNED",
  contacted: "CONTACTED",
  consultation_booked: "APPOINTMENT_SCHEDULED",
  visited: "ATTENDED",
  converted: "CONVERTED",
};

export const STAGE_TO_LEGACY_STATUS = Object.fromEntries(
  Object.entries(LEGACY_STATUS_TO_STAGE).map(([status, stage]) => [stage, status]),
);

export const BIRTHWAVE_LEAD_SOURCES = [
  "google_ads",
  "meta_ads",
  "website",
  "whatsapp",
  "walk_in",
  "referral",
  "instagram",
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
      contact_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: tableName.BIRTHWAVE_CONTACTS, key: "id" },
      },
      current_team_id: { type: Sequelize.INTEGER, allowNull: true },
      current_owner_id: { type: Sequelize.INTEGER, allowNull: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      email: { type: Sequelize.STRING(200), allowNull: true },
      // BW-SVC-001: `service` is now LEGACY / COMPATIBILITY. `service_id` is the
      // canonical reference into birthwave_services; the text is still written
      // alongside it so anything not yet migrated keeps working. Not dropped.
      service: { type: Sequelize.STRING(255), allowNull: true },
      service_id: { type: Sequelize.INTEGER, allowNull: true },
      source: { type: Sequelize.STRING(50), allowNull: true },
      // BW-FIX-008: canonical stage vocabulary (BW-FIX-002). The old
      // "new_lead" default meant any create() that omitted status wrote a
      // legacy value straight back into the column BW-FIX-002 had just
      // normalized. Kept in sync with the DB default by
      // 20260909_birthwave_v1_reconciliation_fixes.
      status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: "NEW" },
      assigned_doctor_id: { type: Sequelize.INTEGER, allowNull: true },
      next_follow_up: { type: Sequelize.DATE, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      source_provider: { type: Sequelize.STRING(50), allowNull: true },
      source_external_id: { type: Sequelize.STRING(191), allowNull: true },
      custom_fields: { type: Sequelize.JSON, allowNull: true },
      integration_metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        get() {
          const value = this.getDataValue("integration_metadata");
          return typeof value === "string" ? JSON.parse(value) : value;
        },
      },
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
        { name: "idx_bw_leads_client_contact", fields: ["client_id", "contact_id"] },
        { name: "idx_bw_leads_client_team", fields: ["client_id", "current_team_id"] },
        { name: "idx_bw_leads_client_owner", fields: ["client_id", "current_owner_id"] },
      ],
    },
  );
