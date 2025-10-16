import { tableName } from "../tableName.js";

export const vlslawaibeTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.VLSLAWAIBE, {
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

    programm_start_date: {
      type: Sequelize.DATE,
      allowNull: false,
    },

    programm_end_date: {
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
