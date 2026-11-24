import db from "../index.js";
import { tableName } from "../tables/tableName.js";

const COLUMNS = {
  pregnancy_weeks: {
    type: db.Sequelize.INTEGER.UNSIGNED,
    allowNull: true,
  },
};

export const ensureBirthwavePrenatalYogaColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  let changed = false;

  for (const table of [tableName.BIRTHWAVE_WEBSITE_LEADS, tableName.BIRTHWAVE_LEADS]) {
    const columns = await queryInterface.describeTable(table);
    if (Object.prototype.hasOwnProperty.call(columns, "pregnancy_weeks")) continue;
    await queryInterface.addColumn(table, "pregnancy_weeks", COLUMNS.pregnancy_weeks);
    console.log(`[Schema] Added missing column ${table}.pregnancy_weeks`);
    changed = true;
  }

  return changed;
};

export default ensureBirthwavePrenatalYogaColumns;
