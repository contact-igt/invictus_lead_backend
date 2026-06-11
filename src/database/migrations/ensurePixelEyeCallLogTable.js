import db from "../index.js";
import { tableName } from "../tables/tableName.js";
import {
  buildPixelEyeCallLogCreateTableDefinition,
} from "../tables/PixelEyeCallLogTable/index.js";

const TABLE_INDEXES = [
  {
    name: "pixel_eye_call_logs_client_phone_date_idx",
    fields: ["client_id", "normalized_phone_number", "call_date"],
  },
  {
    name: "pixel_eye_call_logs_client_call_idx",
    fields: ["client_id", "call_id"],
  },
  {
    name: "pixel_eye_call_logs_client_started_at_idx",
    fields: ["client_id", "call_started_at"],
  },
  {
    name: "pixel_eye_call_logs_created_at_idx",
    fields: ["created_at"],
  },
];

const normalizeIndexName = (index) => String(index?.name || "").trim().toLowerCase();

const hasIndex = (existingIndexes, indexName) =>
  existingIndexes.some((index) => normalizeIndexName(index) === indexName.toLowerCase());

const ensureTableExists = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  const tableExists = tables.some((entry) => {
    const value =
      typeof entry === "string"
        ? entry
        : entry?.tableName || entry?.TABLE_NAME || "";
    return String(value).toLowerCase() === tableName.PIXELEYE_CALL_LOGS.toLowerCase();
  });

  if (tableExists) {
    return false;
  }

  await queryInterface.createTable(
    tableName.PIXELEYE_CALL_LOGS,
    buildPixelEyeCallLogCreateTableDefinition(db.Sequelize, db.sequelize),
  );

  console.log(
    `[Schema] Created missing table ${tableName.PIXELEYE_CALL_LOGS}`,
  );

  return true;
};

const ensureMissingColumns = async (queryInterface) => {
  const columns = await queryInterface.describeTable(tableName.PIXELEYE_CALL_LOGS);
  const columnDefinitions = buildPixelEyeCallLogCreateTableDefinition(
    db.Sequelize,
    db.sequelize,
  );

  let changed = false;

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (Object.prototype.hasOwnProperty.call(columns, columnName)) {
      continue;
    }

    await queryInterface.addColumn(
      tableName.PIXELEYE_CALL_LOGS,
      columnName,
      definition,
    );

    console.log(
      `[Schema] Added missing column ${tableName.PIXELEYE_CALL_LOGS}.${columnName}`,
    );
    changed = true;
  }

  return changed;
};

const ensureMissingIndexes = async (queryInterface) => {
  const existingIndexes = await queryInterface.showIndex(
    tableName.PIXELEYE_CALL_LOGS,
  );
  let changed = false;

  for (const index of TABLE_INDEXES) {
    if (hasIndex(existingIndexes, index.name)) {
      continue;
    }

    await queryInterface.addIndex(tableName.PIXELEYE_CALL_LOGS, index.fields, {
      name: index.name,
    });

    console.log(
      `[Schema] Added missing index ${index.name} on ${tableName.PIXELEYE_CALL_LOGS}`,
    );
    changed = true;
  }

  return changed;
};

export const ensurePixelEyeCallLogTable = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableCreated = await ensureTableExists(queryInterface);
  const columnsChanged = tableCreated ? false : await ensureMissingColumns(queryInterface);
  const indexesChanged = await ensureMissingIndexes(queryInterface);

  return tableCreated || columnsChanged || indexesChanged;
};

export default ensurePixelEyeCallLogTable;
