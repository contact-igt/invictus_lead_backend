import { tableName } from "../tableName.js";

export const BIRTHWAVE_CONTACT_RESULTS = ["CONNECTED", "NOT_REACHED"];
export const BIRTHWAVE_NOT_REACHED_REASONS = ["NO_ANSWER", "BUSY", "UNREACHABLE", "OTHER"];
export const BIRTHWAVE_DISPOSITIONS = ["INTERESTED", "FOLLOW_UP_REQUIRED", "CALL_LATER", "APPOINTMENT_REQUIRED", "NOT_INTERESTED", "WRONG_NUMBER", "INVALID_LEAD", "OTHER"];
export const BIRTHWAVE_NEXT_ACTION_TYPES = ["FOLLOW_UP", "RETRY_CALL", "APPOINTMENT", "MANUAL_TASK"];
export const BIRTHWAVE_LOST_REASONS = ["NOT_INTERESTED", "PRICE", "LOCATION", "ALREADY_CHOSEN_ANOTHER_HOSPITAL", "NO_RESPONSE_AFTER_MAX_ATTEMPTS", "NOT_ELIGIBLE", "SERVICE_UNAVAILABLE", "OTHER"];

export const BirthwaveDispositionTable = (Sequelize, sequelize) => sequelize.define("BirthwaveDisposition", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
  lead_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_LEADS, key: "id" } },
  task_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_TASKS, key: "id" } },
  call_id: { type: Sequelize.INTEGER, allowNull: true },
  evidence_source: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "MANUAL_TASK" },
  contact_result: { type: Sequelize.STRING(24), allowNull: false },
  not_reached_reason: { type: Sequelize.STRING(32), allowNull: true },
  disposition: { type: Sequelize.STRING(40), allowNull: true },
  notes: { type: Sequelize.TEXT, allowNull: true },
  next_action_type: { type: Sequelize.STRING(32), allowNull: true },
  next_action_due_at: { type: Sequelize.DATE, allowNull: true },
  appointment_id: { type: Sequelize.INTEGER, allowNull: true },
  lost_reason: { type: Sequelize.STRING(64), allowNull: true },
  outcome_event_id: { type: Sequelize.STRING(191), allowNull: false },
  created_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.MANAGEMENT, key: "id" } },
}, {
  tableName: tableName.BIRTHWAVE_DISPOSITIONS,
  freezeTableName: true,
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
  indexes: [
    { name: "uq_bw_dispositions_event", unique: true, fields: ["client_id", "outcome_event_id"] },
    { name: "idx_bw_dispositions_lead_created", fields: ["client_id", "lead_id", "created_at"] },
    { name: "idx_bw_dispositions_task", fields: ["client_id", "task_id"] },
  ],
});

export default BirthwaveDispositionTable;
