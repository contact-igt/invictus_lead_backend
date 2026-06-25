import db from "../index.js";
import { tableName } from "../tables/tableName.js";

export const ensurePixelEyeLeadStateCompletionSourceColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(
    tableName.PIXELEYE_LEAD_STATE,
  );

  if (Object.prototype.hasOwnProperty.call(columns, "completion_source")) {
    return false;
  }

  await queryInterface.addColumn(
    tableName.PIXELEYE_LEAD_STATE,
    "completion_source",
    {
      type: db.Sequelize.STRING,
      allowNull: true,
    },
  );

  console.log(
    `[Schema] Added missing column ${tableName.PIXELEYE_LEAD_STATE}.completion_source`,
  );

  return true;
};

export default ensurePixelEyeLeadStateCompletionSourceColumn;
