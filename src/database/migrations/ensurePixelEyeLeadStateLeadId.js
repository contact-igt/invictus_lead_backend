import db from "../index.js";
import { tableName } from "../tables/tableName.js";

const ensureLeadIdColumn = async (queryInterface) => {
  const columns = await queryInterface.describeTable(
    tableName.PIXELEYE_LEAD_STATE,
  );

  if (Object.prototype.hasOwnProperty.call(columns, "lead_id")) {
    return false;
  }

  await queryInterface.addColumn(tableName.PIXELEYE_LEAD_STATE, "lead_id", {
    type: db.Sequelize.INTEGER,
    allowNull: true,
    references: { model: tableName.PIXELEYE, key: "id" },
  });

  console.log(
    `[Schema] Added missing column ${tableName.PIXELEYE_LEAD_STATE}.lead_id`,
  );

  return true;
};

const ensureLeadIdIndex = async (queryInterface) => {
  const existingIndexes = await queryInterface.showIndex(
    tableName.PIXELEYE_LEAD_STATE,
  );

  const hasIndex = existingIndexes.some(
    (index) =>
      String(index.name || "").toLowerCase() ===
      "pixel_eye_lead_state_client_lead_unique",
  );

  if (hasIndex) {
    return false;
  }

  await queryInterface.addIndex(
    tableName.PIXELEYE_LEAD_STATE,
    ["client_id", "lead_id"],
    {
      unique: true,
      name: "pixel_eye_lead_state_client_lead_unique",
    },
  );

  console.log(
    `[Schema] Added missing unique index pixel_eye_lead_state_client_lead_unique on ${tableName.PIXELEYE_LEAD_STATE}`,
  );

  return true;
};

export const ensurePixelEyeLeadStateLeadIdColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const columnChanged = await ensureLeadIdColumn(queryInterface);
  const indexChanged = await ensureLeadIdIndex(queryInterface);

  return columnChanged || indexChanged;
};

export default ensurePixelEyeLeadStateLeadIdColumn;
