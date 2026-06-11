import db from "../index.js";
import { tableName } from "../tables/tableName.js";
import { buildPixelEyeFollowUpHistoryCreateTableDefinition } from "../tables/PixelEyeFollowUpHistoryTable/index.js";

const TABLE_INDEXES = [
  {
    name: "pixel_eye_follow_up_history_client_call_idx",
    fields: ["client_id", "call_id"],
  },
  {
    name: "pixel_eye_follow_up_history_client_lead_idx",
    fields: ["client_id", "lead_id"],
  },
  {
    name: "pixel_eye_follow_up_history_created_at_idx",
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
    return String(value).toLowerCase() === tableName.PIXELEYE_FOLLOW_UP_HISTORY.toLowerCase();
  });

  if (tableExists) {
    return false;
  }

  await queryInterface.createTable(
    tableName.PIXELEYE_FOLLOW_UP_HISTORY,
    buildPixelEyeFollowUpHistoryCreateTableDefinition(db.Sequelize, db.sequelize),
  );

  console.log(
    `[Schema] Created missing table ${tableName.PIXELEYE_FOLLOW_UP_HISTORY}`,
  );

  return true;
};

const ensureMissingColumns = async (queryInterface) => {
  const columns = await queryInterface.describeTable(
    tableName.PIXELEYE_FOLLOW_UP_HISTORY,
  );

  const columnDefinitions = buildPixelEyeFollowUpHistoryCreateTableDefinition(
    db.Sequelize,
    db.sequelize,
  );

  let changed = false;

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (Object.prototype.hasOwnProperty.call(columns, columnName)) {
      continue;
    }

    await queryInterface.addColumn(
      tableName.PIXELEYE_FOLLOW_UP_HISTORY,
      columnName,
      definition,
    );

    console.log(
      `[Schema] Added missing column ${tableName.PIXELEYE_FOLLOW_UP_HISTORY}.${columnName}`,
    );
    changed = true;
  }

  return changed;
};

const ensureMissingIndexes = async (queryInterface) => {
  const existingIndexes = await queryInterface.showIndex(
    tableName.PIXELEYE_FOLLOW_UP_HISTORY,
  );
  let changed = false;

  for (const index of TABLE_INDEXES) {
    if (hasIndex(existingIndexes, index.name)) {
      continue;
    }

    await queryInterface.addIndex(tableName.PIXELEYE_FOLLOW_UP_HISTORY, index.fields, {
      name: index.name,
    });

    console.log(
      `[Schema] Added missing index ${index.name} on ${tableName.PIXELEYE_FOLLOW_UP_HISTORY}`,
    );
    changed = true;
  }

  return changed;
};

const ensureNoForeignKeys = async (queryInterface) => {
  const references = await queryInterface.getForeignKeyReferencesForTable(
    tableName.PIXELEYE_FOLLOW_UP_HISTORY,
  );
  let changed = false;

  for (const reference of references) {
    const columnName = reference.columnName || reference.column_name;
    const constraintName = reference.constraintName || reference.constraint_name;

    if (!["client_id", "lead_id"].includes(columnName) || !constraintName) {
      continue;
    }

    await queryInterface.removeConstraint(
      tableName.PIXELEYE_FOLLOW_UP_HISTORY,
      constraintName,
    );
    console.log(
      `[Schema] Removed foreign key ${constraintName} from ${tableName.PIXELEYE_FOLLOW_UP_HISTORY}.${columnName}`,
    );
    changed = true;
  }

  return changed;
};

export const ensurePixelEyeFollowUpHistoryTable = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableCreated = await ensureTableExists(queryInterface);
  const columnsChanged = tableCreated ? false : await ensureMissingColumns(queryInterface);
  const foreignKeysChanged = await ensureNoForeignKeys(queryInterface);
  const indexesChanged = await ensureMissingIndexes(queryInterface);

  return tableCreated || columnsChanged || foreignKeysChanged || indexesChanged;
};

export default ensurePixelEyeFollowUpHistoryTable;
