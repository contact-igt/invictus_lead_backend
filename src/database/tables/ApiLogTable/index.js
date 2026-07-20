import { tableName } from "../tableName.js";

export const ApiLogTable = (Sequelize, sequelize) =>
  sequelize.define(
    "ApiLog",
    {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      request_id: { type: Sequelize.STRING(64), allowNull: false },
      method: { type: Sequelize.STRING(10), allowNull: false },
      path: { type: Sequelize.STRING(512), allowNull: false },
      status_code: { type: Sequelize.INTEGER, allowNull: false },
      duration_ms: { type: Sequelize.INTEGER, allowNull: false },
      user_id: { type: Sequelize.INTEGER, allowNull: true },
      user_email: { type: Sequelize.STRING(255), allowNull: true },
      user_role: { type: Sequelize.STRING(50), allowNull: true },
      client_id: { type: Sequelize.INTEGER, allowNull: true },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      request_body: { type: Sequelize.JSON, allowNull: true },
      response_body: { type: Sequelize.JSON, allowNull: true },
      error_message: { type: Sequelize.STRING(1000), allowNull: true },

      createdAt: {
        type: "TIMESTAMP",
        allowNull: false,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        field: "created_at",
      },
      updatedAt: {
        type: "TIMESTAMP",
        allowNull: false,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        field: "updated_at",
      },
    },
    {
      tableName: tableName.API_LOGS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
      indexes: [
        { fields: ["created_at"] },
        { fields: ["status_code"] },
        { fields: ["path"] },
        { fields: ["user_id"] },
        { fields: ["client_id"] },
      ],
    },
  );
