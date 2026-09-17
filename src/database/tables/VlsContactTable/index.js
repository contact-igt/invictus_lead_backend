import { tableName } from "../tableName.js";

// Website Enquiries — the VLS main site's /contact page form.
export const vlsContactTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName.VLS_CONTACT, {
    client_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: tableName.CLIENTS, key: "id" },
    },
    name: { type: Sequelize.STRING, allowNull: true },
    mobile: { type: Sequelize.STRING, allowNull: true },
    email: { type: Sequelize.STRING, allowNull: true, validate: { isEmail: true } },
    message: { type: Sequelize.TEXT, allowNull: true },
    ip_address: { type: Sequelize.STRING, allowNull: true },
    utm_source: { type: Sequelize.STRING, allowNull: true },

    sheet_sync_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "pending" },
    sheet_sync_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    sheet_sync_last_error: { type: Sequelize.TEXT, allowNull: true },
    sheet_synced_at: { type: Sequelize.DATE, allowNull: true },
    sheet_sync_next_attempt_at: { type: Sequelize.DATE, allowNull: true },

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
  }, {
    indexes: [
      { name: "idx_vls_contact_client_id", fields: ["client_id"] },
      { name: "idx_vls_contact_sheet_sync", fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"] },
    ],
  });
};
