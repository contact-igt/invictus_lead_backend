import { tableName } from "../tableName.js";

export const invictusTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.INVICTUS, {
    name: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    mobile: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    email: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    service: {
      type: Sequelize.ENUM(
        "social media marketing",
        "performance marketing",
        "digital service",
        "web & app development"
      ),
      allowNull: false,
    },

    description: {
      type: Sequelize.TEXT,
      allowNull: true,
    },

    registered_date: {
      type: Sequelize.DATE,
      allowNull: false,
    },

    createdAt: {
      type: "TIMESTAMP",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: true,
      field: "created_at",
    },

    updatedAt: {
      type: "TIMESTAMP",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: true,
      field: "updated_at",
    },
  });
};
