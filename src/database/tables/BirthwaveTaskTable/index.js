import { tableName } from "../tableName.js";

export const BIRTHWAVE_TASK_TYPES = ["INITIAL_CALL", "RETRY_CALL", "FOLLOW_UP", "APPOINTMENT_CONFIRMATION", "NO_SHOW_RECOVERY", "MANUAL_TASK"];
export const BIRTHWAVE_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "RESCHEDULED", "CANCELLED"];
export const BIRTHWAVE_TASK_PRIORITIES = ["NORMAL", "HIGH"];

export const BirthwaveTaskTable = (Sequelize, sequelize) => sequelize.define("BirthwaveTask", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
  lead_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_LEADS, key: "id" } },
  team_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_TEAMS, key: "id" } },
  owner_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.MANAGEMENT, key: "id" } },
  task_type: { type: Sequelize.STRING(40), allowNull: false },
  status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: "PENDING" },
  priority: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "NORMAL" },
  due_at: { type: Sequelize.DATE, allowNull: false },
  started_at: { type: Sequelize.DATE, allowNull: true },
  completed_at: { type: Sequelize.DATE, allowNull: true },
  cancelled_at: { type: Sequelize.DATE, allowNull: true },
  is_primary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
  parent_task_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.BIRTHWAVE_TASKS, key: "id" } },
  attempt_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
  completion_reason: { type: Sequelize.STRING(500), allowNull: true },
  metadata: { type: Sequelize.JSON, allowNull: true },
  created_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.MANAGEMENT, key: "id" } },
  updated_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.MANAGEMENT, key: "id" } },
}, {
  tableName: tableName.BIRTHWAVE_TASKS,
  freezeTableName: true,
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
  indexes: [
    { name: "idx_bw_tasks_client", fields: ["client_id"] },
    { name: "idx_bw_tasks_lead", fields: ["client_id", "lead_id"] },
    { name: "idx_bw_tasks_owner_status_due", fields: ["client_id", "owner_id", "status", "due_at"] },
    { name: "idx_bw_tasks_team_status_due", fields: ["client_id", "team_id", "status", "due_at"] },
    { name: "idx_bw_tasks_status_type_due", fields: ["client_id", "status", "task_type", "due_at"] },
    { name: "idx_bw_tasks_primary", fields: ["client_id", "lead_id", "is_primary", "status"] },
    { name: "idx_bw_tasks_parent", fields: ["client_id", "parent_task_id"] },
  ],
});

export default BirthwaveTaskTable;
