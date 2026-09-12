import { tableName } from "../tableName.js";

export const BIRTHWAVE_ASSIGNMENT_TYPES = ["MANUAL", "BULK_MANUAL", "ROUND_ROBIN", "REASSIGNMENT"];

export const BirthwaveLeadAssignmentTable = (Sequelize, sequelize) => sequelize.define(
  "BirthwaveLeadAssignment",
  {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
    lead_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_LEADS, key: "id" } },
    team_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_TEAMS, key: "id" } },
    owner_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.MANAGEMENT, key: "id" } },
    assignment_type: { type: Sequelize.STRING(32), allowNull: false },
    assigned_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: tableName.MANAGEMENT, key: "id" } },
    reason: { type: Sequelize.STRING(500), allowNull: true },
    is_current: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    assigned_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    ended_at: { type: Sequelize.DATE, allowNull: true },
  },
  {
    tableName: tableName.BIRTHWAVE_LEAD_ASSIGNMENTS,
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { name: "idx_bw_assignments_client_lead_current", fields: ["client_id", "lead_id", "is_current"] },
      { name: "idx_bw_assignments_client_owner_current", fields: ["client_id", "owner_id", "is_current"] },
      { name: "idx_bw_assignments_client_team_current", fields: ["client_id", "team_id", "is_current"] },
    ],
  },
);

export default BirthwaveLeadAssignmentTable;
