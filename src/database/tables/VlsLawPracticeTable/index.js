import { tableName } from "../tableName.js";

export const vlslawpracticeTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.VLSLAWPRACTISE, {
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

    amount: {
      type: Sequelize.STRING,
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

    razorpay_order_id: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    razorpay_payment_id: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    razorpay_signature: {
      type: Sequelize.STRING,
      allowNull: true,
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
