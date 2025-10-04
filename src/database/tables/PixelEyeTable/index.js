import { tableName } from "../tableName.js";

export const pixelEyeTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.PIXELEYE, {
    name: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    mobile: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    age: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    city: {
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
      type: Sequelize.ENUM("lasik", "retina", "squint", "cataract"),
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


