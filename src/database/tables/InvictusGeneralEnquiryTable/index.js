export const InvictusGeneralEnquiryTable = (Sequelize, sequelize) => {
  return sequelize.define(
    "invictus_general_enquiries",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      mobile: {
        type: Sequelize.STRING(10),
        allowNull: false,
        validate: {
          is: /^[0-9]{10}$/,
        },
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      industry: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      applied_for: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "General Inquiry",
      },
      submitted_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("New", "Contacted", "In Progress", "Closed"),
        defaultValue: "New",
      },
      city: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      state: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sheet_sync_status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "pending",
        validate: { isIn: [["pending", "synced", "failed"]] },
      },
      sheet_sync_attempts: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      sheet_sync_last_error: {
        type: Sequelize.TEXT,
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
    },
    {
      timestamps: true,
      tableName: "invictus_general_enquiries",
      indexes: [
        {
          fields: ["submitted_at"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["city"],
        },
        {
          fields: ["state"],
        },
        {
          name: "invictus_general_sheet_sync_idx",
          fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"],
        },
      ],
    }
  );
};
