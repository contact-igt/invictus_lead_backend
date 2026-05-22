import { tableName } from "../tableName.js";

export const vlsPropertyLawTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName.VLSLAWPROPERTY, {
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

    years_of_practice: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    amount: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    },

    programm_date: {
      type: Sequelize.DATE,
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
      type: Sequelize.ENUM("paid", "failed", "attempted", "cancelled"),
      allowNull: false,
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
