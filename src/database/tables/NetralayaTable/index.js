import { tableName } from "../tableName.js";

export const netralyaTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.NETRALAYA, {
    name: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    mobile: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    ip_address: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    utm_source: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    page_name: {
      type: Sequelize.STRING,
      allowNull: false,
    },

    enquiry_count: {
      type: Sequelize.INTEGER,
      allowNull: false,
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
