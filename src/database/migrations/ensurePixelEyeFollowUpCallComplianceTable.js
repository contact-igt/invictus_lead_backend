import db from "../index.js";
import { tableName } from "../tables/tableName.js";
import {
  buildPixelEyeFollowUpCallComplianceCreateTableDefinition,
} from "../tables/PixelEyeFollowUpCallComplianceTable/index.js";

const TABLE_INDEXES = [
  {
    name: "pixel_eye_follow_up_call_compliance_client_phone_date_idx",
    fields: ["client_id", "normalized_phone_number", "scheduled_follow_up_date"],
  },
  {
    name: "pixel_eye_follow_up_call_compliance_client_call_idx",
    fields: ["client_id", "call_id"],
  },
  {
    name: "pixel_eye_follow_up_call_compliance_status_allowed_idx",
    fields: ["compliance_status", "allowed_until"],
  },
  {
    name: "pixel_eye_follow_up_call_compliance_client_status_idx",
    fields: ["client_id", "compliance_status"],
  },
  {
    name: "pixel_eye_follow_up_call_compliance_created_at_idx",
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
    return String(value).toLowerCase() === tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE.toLowerCase();
  });

  if (tableExists) {
    return false;
  }

  await queryInterface.createTable(
    tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE,
    buildPixelEyeFollowUpCallComplianceCreateTableDefinition(db.Sequelize, db.sequelize),
  );

  console.log(
    `[Schema] Created missing table ${tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE}`,
  );

  return true;
};

const ensureMissingColumns = async (queryInterface) => {
  const columns = await queryInterface.describeTable(
    tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE,
  );

  const columnDefinitions = buildPixelEyeFollowUpCallComplianceCreateTableDefinition(
    db.Sequelize,
    db.sequelize,
  );

  let changed = false;

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (Object.prototype.hasOwnProperty.call(columns, columnName)) {
      continue;
    }

    await queryInterface.addColumn(
      tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE,
      columnName,
      definition,
    );

    console.log(
      `[Schema] Added missing column ${tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE}.${columnName}`,
    );
    changed = true;
  }

  return changed;
};

const ensureMissingIndexes = async (queryInterface) => {
  const existingIndexes = await queryInterface.showIndex(
    tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE,
  );
  let changed = false;

  for (const index of TABLE_INDEXES) {
    if (hasIndex(existingIndexes, index.name)) {
      continue;
    }

    await queryInterface.addIndex(
      tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE,
      index.fields,
      {
        name: index.name,
      },
    );

    console.log(
      `[Schema] Added missing index ${index.name} on ${tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE}`,
    );
    changed = true;
  }

  return changed;
};

export const ensurePixelEyeFollowUpCallComplianceTable = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableCreated = await ensureTableExists(queryInterface);
  const columnsChanged = tableCreated ? false : await ensureMissingColumns(queryInterface);
  const indexesChanged = await ensureMissingIndexes(queryInterface);

  return tableCreated || columnsChanged || indexesChanged;
};

export default ensurePixelEyeFollowUpCallComplianceTable;
