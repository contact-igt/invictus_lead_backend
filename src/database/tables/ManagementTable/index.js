import { tableName } from "../tableName.js";

export const managementTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName.MANAGEMENT, {
    client_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: tableName.CLIENTS,
        key: "id",
      },
    },

    title: {
      type: Sequelize.ENUM("Mr", "Ms", "Mrs"),
      allowNull: false,
    },

    username: {
      type: Sequelize.STRING,
      allowNull: false,
    },

    email: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    country_code: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    mobile: {
      type: Sequelize.STRING,
      allowNull: false,
    },

    profile_picture: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    password: {
      type: Sequelize.STRING,
      allowNull: false,
    },

    role: {
      type: Sequelize.ENUM("super-admin", "admin", "client"),
      allowNull: false,
    },

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
  });
};
