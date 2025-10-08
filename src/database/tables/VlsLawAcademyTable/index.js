import { tableName } from "../tableName.js";

export const vlsLawAcademyTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.VLSLAWACADEMY, {
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
