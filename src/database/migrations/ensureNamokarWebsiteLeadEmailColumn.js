import db from "../index.js";
import { tableName } from "../tables/tableName.js";

export const ensureNamokarWebsiteLeadEmailColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  try {
    const columns = await queryInterface.describeTable(tableName.NAMOKAR_WEBSITE_LEADS);
    if (!Object.hasOwn(columns, "email")) {
      await queryInterface.addColumn(tableName.NAMOKAR_WEBSITE_LEADS, "email", {
        type: db.Sequelize.STRING(254),
        allowNull: true,
      });
    }
  } catch {
    // The table does not exist yet; sequelize.sync() creates it from the model.
  }
};
