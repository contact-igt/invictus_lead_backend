import { tableName } from "../tableName.js";

export const BirthwaveAssignmentCursorTable = (Sequelize, sequelize) => sequelize.define(
  "BirthwaveAssignmentCursor",
  {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
    team_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.BIRTHWAVE_TEAMS, key: "id" } },
    scope_key: { type: Sequelize.STRING(191), allowNull: false },
    last_member_id: { type: Sequelize.INTEGER, allowNull: true },
    version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: tableName.BIRTHWAVE_ASSIGNMENT_CURSORS,
    freezeTableName: true,
    timestamps: true,
    createdAt: false,
    updatedAt: "updated_at",
    indexes: [{ name: "uq_bw_cursors_client_team_scope", unique: true, fields: ["client_id", "team_id", "scope_key"] }],
  },
);

export default BirthwaveAssignmentCursorTable;
