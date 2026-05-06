import { tableName } from "../tableName.js";

export const vlslawpracticeTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.VLSLAWPRACTISE, {
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

    amount: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    },

    registered_date: {
      type: Sequelize.DATE,
      allowNull: false,
    },

    programm_date: {
      type: Sequelize.DATE,
      allowNull: false,
    },

    payment_status: {
      type: Sequelize.ENUM("paid", "failed", "attempted", "cancelled"),
      allowNull: false,
    },

    captured: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    },

    page_name: {
      type: Sequelize.ENUM("decoding-of-practice", "decoding-of-law-practice"),
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
