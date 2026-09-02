import { tableName } from "../tableName.js";

export const BirthwaveDoctorTable = (Sequelize, sequelize) =>
  sequelize.define(
    "BirthwaveDoctor",
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },
      name: { type: Sequelize.STRING(150), allowNull: false },
      specialty: { type: Sequelize.STRING(150), allowNull: true },
      avatar_url: { type: Sequelize.STRING(500), allowNull: true },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: tableName.BIRTHWAVE_DOCTORS,
      freezeTableName: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_bw_doctors_client_id", fields: ["client_id"] },
        { name: "idx_bw_doctors_client_active", fields: ["client_id", "active"] },
      ],
    },
  );
