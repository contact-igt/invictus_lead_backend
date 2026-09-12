import { tableName } from "../tableName.js";

export const BIRTHWAVE_ATTENTION_TYPES = ["UNASSIGNED_LEAD", "ASSIGNMENT_FAILED", "ROUTING_FAILED", "MISSING_OWNER", "MISSING_NEXT_ACTION", "TASK_OVERDUE", "FOLLOW_UP_OVERDUE"];
export const BIRTHWAVE_ATTENTION_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"];
export const BIRTHWAVE_ATTENTION_SEVERITIES = ["NORMAL", "HIGH"];

export const BirthwaveAttentionTable = (Sequelize, sequelize) => sequelize.define("BirthwaveAttentionItem", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
  lead_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.BIRTHWAVE_LEADS, key: "id" } },
  task_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.BIRTHWAVE_TASKS, key: "id" } },
  team_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.BIRTHWAVE_TEAMS, key: "id" } },
  owner_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.MANAGEMENT, key: "id" } },
  attention_type: { type: Sequelize.STRING(40), allowNull: false },
  status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "OPEN" },
  severity: { type: Sequelize.STRING(12), allowNull: false, defaultValue: "NORMAL" },
  title: { type: Sequelize.STRING(180), allowNull: false },
  description: { type: Sequelize.TEXT, allowNull: true },
  detected_at: { type: Sequelize.DATE, allowNull: false },
  acknowledged_at: { type: Sequelize.DATE, allowNull: true },
  acknowledged_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.MANAGEMENT, key: "id" } },
  resolved_at: { type: Sequelize.DATE, allowNull: true },
  resolved_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.MANAGEMENT, key: "id" } },
  resolution_note: { type: Sequelize.TEXT, allowNull: true },
  dedupe_key: { type: Sequelize.STRING(191), allowNull: false },
  metadata: { type: Sequelize.JSON, allowNull: true },
}, { tableName: tableName.BIRTHWAVE_ATTENTION_ITEMS, freezeTableName: true, timestamps: true, createdAt: "created_at", updatedAt: "updated_at", indexes: [
  { name: "uq_bw_attention_dedupe", unique: true, fields: ["client_id", "dedupe_key"] },
  { name: "idx_bw_attention_status_detected", fields: ["client_id", "status", "detected_at"] },
  { name: "idx_bw_attention_team_status", fields: ["client_id", "team_id", "status"] },
  { name: "idx_bw_attention_lead", fields: ["client_id", "lead_id", "status"] },
  { name: "idx_bw_attention_task", fields: ["client_id", "task_id", "status"] },
] });

export default BirthwaveAttentionTable;
