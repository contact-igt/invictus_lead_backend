import db from "../index.js";
import { tableName } from "../tables/tableName.js";

export const ensurePixelEyeLeadNotesColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(tableName.PIXELEYE);

  if (Object.prototype.hasOwnProperty.call(columns, "notes")) {
    return false;
  }

  await queryInterface.addColumn(tableName.PIXELEYE, "notes", {
    type: db.Sequelize.TEXT,
    allowNull: true,
  });

  console.log(`[Schema] Added missing column ${tableName.PIXELEYE}.notes`);
  return true;
};

export default ensurePixelEyeLeadNotesColumn;
