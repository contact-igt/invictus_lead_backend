import db from "../index.js";
import { tableName } from "../tables/tableName.js";

export const ensurePixelEyeLeadStateCurrentDayColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(tableName.PIXELEYE_LEAD_STATE);

  if (Object.prototype.hasOwnProperty.call(columns, "current_day")) {
    return false;
  }

  await queryInterface.addColumn(tableName.PIXELEYE_LEAD_STATE, "current_day", {
    type: db.Sequelize.INTEGER,
    allowNull: true,
    defaultValue: null,
  });

  console.log(
    `[Schema] Added missing column ${tableName.PIXELEYE_LEAD_STATE}.current_day`,
  );

  return true;
};

export default ensurePixelEyeLeadStateCurrentDayColumn;
