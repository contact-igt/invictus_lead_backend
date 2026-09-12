import { tableName } from "../tableName.js";

export const BIRTHWAVE_TEAM_MEMBER_ROLES = ["TEAM_MANAGER", "TELECALLER"];
export const BIRTHWAVE_TEAM_MEMBER_STATUSES = ["ACTIVE", "ASSIGNMENT_PAUSED", "INACTIVE"];

export const BirthwaveTeamMemberTable = (Sequelize, sequelize) => sequelize.define(
  "BirthwaveTeamMember",
  {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
    team_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_TEAMS, key: "id" } },
    management_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.MANAGEMENT, key: "id" } },
    operational_role: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "TELECALLER" },
    assignment_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "ACTIVE" },
    service_access: { type: Sequelize.JSON, allowNull: true },
    source_access: { type: Sequelize.JSON, allowNull: true },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    updated_by: { type: Sequelize.INTEGER, allowNull: true },
  },
  {
    tableName: tableName.BIRTHWAVE_TEAM_MEMBERS,
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { name: "uq_bw_team_members_client_team_user", unique: true, fields: ["client_id", "team_id", "management_id"] },
      { name: "idx_bw_team_members_eligible", fields: ["client_id", "team_id", "status", "assignment_enabled"] },
      { name: "idx_bw_team_members_user", fields: ["client_id", "management_id", "status"] },
    ],
  },
);

export default BirthwaveTeamMemberTable;
