import db from "../index.js";
import { tableName } from "../tables/tableName.js";

const TABLE = tableName.BIRTHWAVE_LEADS;

const COLUMNS = {
  integration_metadata: {
    type: db.Sequelize.JSON,
    allowNull: true,
  },
};

const TABLE_INDEXES = [
  { name: "idx_bw_leads_client_phone", fields: ["client_id", "phone"] },
  {
    name: "idx_bw_leads_client_external_id",
    fields: ["client_id", "source_external_id"],
  },
];

const normalizeIndexName = (index) =>
  String(index?.name || "").trim().toLowerCase();

const hasIndex = (existingIndexes, indexName) =>
  existingIndexes.some(
    (index) => normalizeIndexName(index) === indexName.toLowerCase(),
  );

export const ensureBirthwaveLeadIntegrationColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  let changed = false;

  const columns = await queryInterface.describeTable(TABLE);
  for (const [columnName, definition] of Object.entries(COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(columns, columnName)) continue;
    await queryInterface.addColumn(TABLE, columnName, definition);
    console.log(`[Schema] Added missing column ${TABLE}.${columnName}`);
    changed = true;
  }

  const existingIndexes = await queryInterface.showIndex(TABLE);
  for (const index of TABLE_INDEXES) {
    if (hasIndex(existingIndexes, index.name)) continue;
    await queryInterface.addIndex(TABLE, index.fields, { name: index.name });
    console.log(`[Schema] Added missing index ${index.name} on ${TABLE}`);
    changed = true;
  }

  return changed;
};

export default ensureBirthwaveLeadIntegrationColumns;
