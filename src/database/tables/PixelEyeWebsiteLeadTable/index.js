import { tableName } from "../tableName.js";

export const PixelEyeWebsiteLeadTable = (Sequelize, sequelize) => {
  return sequelize.define(
    "PixelEyeWebsiteLead",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
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
      mobile_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      service: {
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
    },
    {
      tableName: tableName.PIXELEYE_WEBSITE_LEADS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          name: "idx_pixel_eye_website_leads_client_id",
          fields: ["client_id"],
        },
        {
          name: "idx_pixel_eye_website_leads_mobile_number",
          fields: ["mobile_number"],
        },
        {
          name: "idx_pixel_eye_website_leads_created_at",
          fields: ["created_at"],
        },
        {
          name: "idx_pixel_eye_website_leads_client_mobile",
          fields: ["client_id", "mobile_number"],
        },
      ],
    },
  );
};
