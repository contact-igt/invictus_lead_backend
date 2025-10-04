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

    domain_source: {
      type: Sequelize.ENUM("domain1", "domain2"),
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
