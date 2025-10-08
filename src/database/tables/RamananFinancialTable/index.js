import { tableName } from "../tableName.js";

export const ramananFinancialTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.RAMANANFINANCIAL, {
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

    area_of_interest: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    message: {
      type: Sequelize.TEXT,
      allowNull: true,
    },

    registered_date: {
      type: Sequelize.DATE,
      allowNull: false,
    },

    ip_address: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    utm_source: {
      type: Sequelize.STRING,
      allowNull: true,
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
