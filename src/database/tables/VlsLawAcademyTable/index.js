import { tableName } from "../tableName.js";

export const vlsLawAcademyTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.VLSLAWACADEMY, {
    client_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: tableName.CLIENTS,
        key: "id",
      },
    },

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
      validate: {
        isEmail: true,
      },
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
      allowNull: false,
      field: "created_at",
    },

    updatedAt: {
      type: "TIMESTAMP",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
      field: "updated_at",
    },
  });
};
