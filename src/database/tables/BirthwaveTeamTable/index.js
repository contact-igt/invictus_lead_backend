import { tableName } from "../tableName.js";

export const BirthwaveTeamTable = (Sequelize, sequelize) => sequelize.define(
  "BirthwaveTeam",
  {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
    name: { type: Sequelize.STRING(120), allowNull: false },
    code: { type: Sequelize.STRING(80), allowNull: false },
    description: { type: Sequelize.TEXT, allowNull: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: Sequelize.INTEGER, allowNull: true },
    updated_by: { type: Sequelize.INTEGER, allowNull: true },
  },
  {
    tableName: tableName.BIRTHWAVE_TEAMS,
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { name: "uq_bw_teams_client_code", unique: true, fields: ["client_id", "code"] },
      { name: "idx_bw_teams_client_active", fields: ["client_id", "is_active"] },
    ],
  },
);

export default BirthwaveTeamTable;
