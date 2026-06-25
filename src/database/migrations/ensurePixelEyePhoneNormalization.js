import db from "../index.js";
import { tableName } from "../tables/tableName.js";

const NORMALIZED_PHONE_COLUMN = {
  type: db.Sequelize.STRING,
  allowNull: true,
};

const ensureTableColumns = async (queryInterface, table, columnDefinitions) => {
  const columns = await queryInterface.describeTable(table);

  let changed = false;

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (Object.prototype.hasOwnProperty.call(columns, columnName)) {
      continue;
    }

    await queryInterface.addColumn(table, columnName, definition);
    console.log(`[Schema] Added missing column ${table}.${columnName}`);
    changed = true;
  }

  return changed;
};

const ensureIndexes = async (queryInterface, table, indexes) => {
  const existingIndexes = await queryInterface.showIndex(table);
  let changed = false;

  const hasIndex = (name) =>
    existingIndexes.some(
      (index) => String(index.name || "").toLowerCase() === name.toLowerCase(),
    );

  for (const index of indexes) {
    if (hasIndex(index.name)) {
      continue;
    }

    await queryInterface.addIndex(table, index.fields, { name: index.name });
    console.log(`[Schema] Added missing index ${index.name} on ${table}`);
    changed = true;
  }

  return changed;
};

export const ensurePixelEyePhoneNormalization = async () => {
  const queryInterface = db.sequelize.getQueryInterface();

  const leadColumnsChanged = await ensureTableColumns(
    queryInterface,
    tableName.PIXELEYE,
    {
      normalized_phone_number: NORMALIZED_PHONE_COLUMN,
    },
  );
  const leadIndexesChanged = await ensureIndexes(
    queryInterface,
    tableName.PIXELEYE,
    [
      {
        name: "pixel_eye_client_normalized_phone_idx",
        fields: ["client_id", "normalized_phone_number"],
      },
    ],
  );

  const leadStateColumnsChanged = await ensureTableColumns(
    queryInterface,
    tableName.PIXELEYE_LEAD_STATE,
    {
      normalized_phone_number: NORMALIZED_PHONE_COLUMN,
    },
  );
  const leadStateIndexesChanged = await ensureIndexes(
    queryInterface,
    tableName.PIXELEYE_LEAD_STATE,
    [
      {
        name: "pixel_eye_lead_state_client_normalized_phone_idx",
        fields: ["client_id", "normalized_phone_number"],
      },
    ],
  );

  return (
    leadColumnsChanged ||
    leadIndexesChanged ||
    leadStateColumnsChanged ||
    leadStateIndexesChanged
  );
};

export default ensurePixelEyePhoneNormalization;
