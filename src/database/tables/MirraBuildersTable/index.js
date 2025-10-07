import { tableName } from "../tableName.js";

export const mirraBuildersTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.MIRRABUILDERS, {
    name: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    mobile: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    interest_green_building: {
      type: Sequelize.ENUM("yes", "no"),
      allowNull: true,
    },

    plot_build: {
      type: Sequelize.ENUM("yes", "no"),
      allowNull: true,
    },

    budget: {
      type: Sequelize.STRING,
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
