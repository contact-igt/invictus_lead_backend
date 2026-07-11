import { tableName } from "../tableName.js";

export const AntardrashtiNetralayaTable = (Sequelize, sequelize) => {
  return sequelize.define(
    "AntardrashtiNetralaya",
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
      tableName: tableName.ANTARDRASHTI_NETRALAYA,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_antardrashti_netralaya_client_id", fields: ["client_id"] },
        {
          name: "idx_antardrashti_netralaya_mobile_number",
          fields: ["mobile_number"],
        },
        { name: "idx_antardrashti_netralaya_created_at", fields: ["created_at"] },
        {
          name: "idx_antardrashti_netralaya_client_mobile",
          fields: ["client_id", "mobile_number"],
        },
      ],
    },
  );
};


