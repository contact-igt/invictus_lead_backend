import { tableName } from "../tableName.js";

export const vlsDopAiAssistedTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName.VLS_DOP_AI_ASSISTED, {
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

    who_are_you: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    why_join: {
      type: Sequelize.TEXT,
      allowNull: true,
    },

    attending: {
      type: Sequelize.STRING(10),
      allowNull: true,
    },

    email: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },

    programm_date: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    amount: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    },

    registered_date: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
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
      type: Sequelize.STRING(50),
      allowNull: true,
    },

    captured: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    page_name: {
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

    utm_medium: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    utm_campaign: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    utm_term: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    utm_content: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    sheet_sync_status: {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "pending",
    },

    sheet_sync_attempts: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    sheet_sync_last_error: {
      type: Sequelize.STRING(1000),
      allowNull: true,
    },

    sheet_synced_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },

    sheet_sync_next_attempt_at: {
      type: Sequelize.DATE,
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
