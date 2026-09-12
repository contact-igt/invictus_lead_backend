import { tableName } from "../tableName.js";

export const BIRTHWAVE_ASSIGNMENT_METHODS = ["MANUAL", "ROUND_ROBIN"];

export const BirthwaveAssignmentRuleTable = (Sequelize, sequelize) => sequelize.define(
  "BirthwaveAssignmentRule",
  {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
    name: { type: Sequelize.STRING(160), allowNull: false },
    priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
    // BW-SVC-001: `service` is LEGACY / COMPATIBILITY; `service_id` is the
    // canonical routing criterion. Matching prefers service_id and falls back to
    // the text only for rules created before the service master existed.
    service: { type: Sequelize.STRING(255), allowNull: true },
    service_id: { type: Sequelize.INTEGER, allowNull: true },
    source: { type: Sequelize.STRING(80), allowNull: true },
    team_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_TEAMS, key: "id" } },
    assignment_method: { type: Sequelize.STRING(24), allowNull: false, defaultValue: "ROUND_ROBIN" },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: tableName.BIRTHWAVE_ASSIGNMENT_RULES,
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { name: "idx_bw_rules_client_active_priority", fields: ["client_id", "is_active", "priority"] },
      { name: "idx_bw_rules_client_team", fields: ["client_id", "team_id"] },
    ],
  },
);

export default BirthwaveAssignmentRuleTable;
