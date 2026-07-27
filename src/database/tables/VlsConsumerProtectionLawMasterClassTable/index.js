import { tableName } from "../tableName.js";

export const VlsConsumerProtectionLawMasterClassTable = (Sequelize, sequelize) => {
  return sequelize.define(
    tableName.VLS_CONSUMER_PROTECTION_LAW_MASTER_CLASS,
    {
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: tableName.CLIENTS,
          key: "id",
        },
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      mobile: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },

      city: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      profession: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },

      registered_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      programm_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      razorpay_order_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      razorpay_payment_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      razorpay_signature: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      payment_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      captured: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },

      page_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },

      utm_source: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      utm_medium: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      utm_campaign: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      utm_term: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      utm_content: {
        type: Sequelize.STRING(255),
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
    },
    {
      indexes: [
        { fields: ["client_id"] },
        { fields: ["mobile"] },
        { fields: ["email"] },
        { fields: ["registered_date"] },
        { fields: ["programm_date"] },
        { fields: ["payment_status"] },
        { fields: ["created_at"] },
        { fields: ["client_id", "mobile"] },
      ],
    },
  );
};
