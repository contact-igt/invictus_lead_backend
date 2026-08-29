import db from "../index.js";

export const ensureInvictusEnquiryColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();

  // Add an index only if a same-named one is not already present.
  const ensureIndex = async (table, fields, name) => {
    try {
      const existing = await queryInterface.showIndex(table);
      if (existing.some((idx) => idx.name === name)) return;
      await queryInterface.addIndex(table, { fields, name });
      console.log(`[Schema] Added index ${name} on ${table}`);
    } catch (err) {
      // Table missing (sync will create it with model indexes) or a race — safe to ignore.
    }
  };

  // Existing rows predate Sheet synchronization, so initialize them as synced
  // instead of retrying the full history and creating duplicate Sheet rows.
  const ensureSheetSyncColumns = async (table) => {
    try {
      const columns = await queryInterface.describeTable(table);
      const statusWasMissing = !Object.prototype.hasOwnProperty.call(columns, "sheet_sync_status");

      if (statusWasMissing) {
        await queryInterface.addColumn(table, "sheet_sync_status", {
          type: db.Sequelize.STRING(16),
          allowNull: false,
          defaultValue: "synced",
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_attempts")) {
        await queryInterface.addColumn(table, "sheet_sync_attempts", {
          type: db.Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_last_error")) {
        await queryInterface.addColumn(table, "sheet_sync_last_error", {
          type: db.Sequelize.TEXT,
          allowNull: true,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_synced_at")) {
        await queryInterface.addColumn(table, "sheet_synced_at", {
          type: db.Sequelize.DATE,
          allowNull: true,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(columns, "sheet_sync_next_attempt_at")) {
        await queryInterface.addColumn(table, "sheet_sync_next_attempt_at", {
          type: db.Sequelize.DATE,
          allowNull: true,
        });
      }

      await queryInterface.changeColumn(table, "sheet_sync_status", {
        type: db.Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "pending",
      });
    } catch (err) {
      // Table may not exist yet; sequelize.sync() will create it from the model.
    }
  };

  try {
    const generalColumns = await queryInterface.describeTable("invictus_general_enquiries");

    if (!Object.prototype.hasOwnProperty.call(generalColumns, "city")) {
      await queryInterface.addColumn("invictus_general_enquiries", "city", {
        type: db.Sequelize.STRING,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_general_enquiries.city");
    }

    if (!Object.prototype.hasOwnProperty.call(generalColumns, "state")) {
      await queryInterface.addColumn("invictus_general_enquiries", "state", {
        type: db.Sequelize.STRING,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_general_enquiries.state");
    }

    if (!Object.prototype.hasOwnProperty.call(generalColumns, "notes")) {
      await queryInterface.addColumn("invictus_general_enquiries", "notes", {
        type: db.Sequelize.TEXT,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_general_enquiries.notes");
    }
  } catch (err) {
    // Table may not exist yet; sequelize.sync() will create it with all columns.
  }

  try {
    const careerColumns = await queryInterface.describeTable("invictus_careers_applications");

    if (!Object.prototype.hasOwnProperty.call(careerColumns, "state")) {
      await queryInterface.addColumn("invictus_careers_applications", "state", {
        type: db.Sequelize.STRING,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_careers_applications.state");
    }

    if (!Object.prototype.hasOwnProperty.call(careerColumns, "notes")) {
      await queryInterface.addColumn("invictus_careers_applications", "notes", {
        type: db.Sequelize.TEXT,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_careers_applications.notes");
    }
  } catch (err) {
    // Table may not exist yet; sequelize.sync() will create it with all columns.
  }

  await ensureSheetSyncColumns("invictus_general_enquiries");
  await ensureSheetSyncColumns("invictus_careers_applications");

  // Composite indexes backing the dependent State -> City filter aggregation.
  await ensureIndex("invictus_careers_applications", ["state", "current_city"], "invictus_careers_state_city_idx");
  await ensureIndex("invictus_general_enquiries", ["state", "city"], "invictus_general_state_city_idx");
  await ensureIndex("invictus_careers_applications", ["sheet_sync_status", "sheet_sync_next_attempt_at"], "invictus_careers_sheet_sync_idx");
  await ensureIndex("invictus_general_enquiries", ["sheet_sync_status", "sheet_sync_next_attempt_at"], "invictus_general_sheet_sync_idx");

  return true;
};

export default ensureInvictusEnquiryColumns;
