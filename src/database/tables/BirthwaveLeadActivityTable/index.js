import { tableName } from "../tableName.js";

export const BIRTHWAVE_ACTIVITY_EVENT_TYPES = [
  "lead_created",
  "status_changed",
  "assignment_changed",
  "follow_up_scheduled",
  "appointment_created",
  "custom_field_changed",
  "call_logged",
];

export const BirthwaveLeadActivityTable = (Sequelize, sequelize) =>
  sequelize.define(
    "BirthwaveLeadActivity",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      lead_id: { type: Sequelize.INTEGER, allowNull: false },
      actor_user_id: { type: Sequelize.INTEGER, allowNull: true },
      actor_name: { type: Sequelize.STRING(150), allowNull: true },
      event_type: { type: Sequelize.STRING(50), allowNull: false },
      title: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      previous_value: { type: Sequelize.STRING(255), allowNull: true },
      new_value: { type: Sequelize.STRING(255), allowNull: true },
      occurred_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    },
    {
      tableName: tableName.BIRTHWAVE_LEAD_ACTIVITIES,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_bw_activity_client_id", fields: ["client_id"] },
        { name: "idx_bw_activity_lead", fields: ["lead_id", "occurred_at"] },
      ],
    },
  );
