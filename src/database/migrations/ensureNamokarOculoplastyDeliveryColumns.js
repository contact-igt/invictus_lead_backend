import db from "../index.js";

const TABLE = "namokar_oculoplasty_leads";

export const ensureNamokarOculoplastyDeliveryColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  try {
    const columns = await queryInterface.describeTable(TABLE);
    const fields = {
      pulseos_status: { type: db.Sequelize.STRING(20), allowNull: false, defaultValue: "pending" },
      pulseos_attempts: { type: db.Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      pulseos_error: { type: db.Sequelize.STRING(255), allowNull: true },
      pulseos_synced_at: { type: db.Sequelize.DATE, allowNull: true },
    };
    for (const [name, definition] of Object.entries(fields)) {
      if (!Object.hasOwn(columns, name)) await queryInterface.addColumn(TABLE, name, definition);
    }
  } catch {
    // The table does not exist yet; sequelize.sync() creates it from the model.
  }
};
