import { tableName } from "../tableName.js";

export const BIRTHWAVE_APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

export const BirthwaveAppointmentTable = (Sequelize, sequelize) =>
  sequelize.define(
    "BirthwaveAppointment",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      lead_id: { type: Sequelize.INTEGER, allowNull: false },
      doctor_id: { type: Sequelize.INTEGER, allowNull: true },
      service: { type: Sequelize.STRING(255), allowNull: true },
      scheduled_at: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: "scheduled" },
      notes: { type: Sequelize.TEXT, allowNull: true },
    },
    {
      tableName: tableName.BIRTHWAVE_APPOINTMENTS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_bw_appts_client_id", fields: ["client_id"] },
        { name: "idx_bw_appts_client_scheduled", fields: ["client_id", "scheduled_at"] },
        { name: "idx_bw_appts_client_status", fields: ["client_id", "status"] },
        { name: "idx_bw_appts_client_doctor", fields: ["client_id", "doctor_id"] },
        { name: "idx_bw_appts_lead", fields: ["lead_id"] },
      ],
    },
  );
