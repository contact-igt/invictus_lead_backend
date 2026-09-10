import db from "../index.js";
import { tableName } from "../tables/tableName.js";
import { buildIntegrationWebhookEventCreateTableDefinition } from "../tables/IntegrationWebhookEventTable/index.js";

const TABLE = tableName.INTEGRATION_WEBHOOK_EVENTS;

const TABLE_INDEXES = [
  {
    name: "uq_integration_webhook_provider_delivery",
    fields: ["provider", "delivery_id"],
    unique: true,
  },
  {
    name: "idx_integration_webhook_client_provider",
    fields: ["client_id", "provider"],
  },
  { name: "idx_integration_webhook_status", fields: ["status"] },
  { name: "idx_integration_webhook_created_at", fields: ["created_at"] },
];

const normalizeIndexName = (index) =>
  String(index?.name || "").trim().toLowerCase();

const hasIndex = (existingIndexes, indexName) =>
  existingIndexes.some(
    (index) => normalizeIndexName(index) === indexName.toLowerCase(),
  );

const ensureTableExists = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  const exists = tables.some((entry) => {
    const value =
      typeof entry === "string"
        ? entry
        : entry?.tableName || entry?.TABLE_NAME || "";
    return String(value).toLowerCase() === TABLE.toLowerCase();
  });

  if (exists) return false;

  await queryInterface.createTable(
    TABLE,
    buildIntegrationWebhookEventCreateTableDefinition(db.Sequelize, db.sequelize),
  );
  console.log(`[Schema] Created missing table ${TABLE}`);
  return true;
};

const ensureMissingColumns = async (queryInterface) => {
  const columns = await queryInterface.describeTable(TABLE);
  const definitions = buildIntegrationWebhookEventCreateTableDefinition(
    db.Sequelize,
    db.sequelize,
  );

  let changed = false;
  for (const [columnName, definition] of Object.entries(definitions)) {
    if (Object.prototype.hasOwnProperty.call(columns, columnName)) continue;
    await queryInterface.addColumn(TABLE, columnName, definition);
    console.log(`[Schema] Added missing column ${TABLE}.${columnName}`);
    changed = true;
  }
  return changed;
};

const ensureMissingIndexes = async (queryInterface) => {
  const existingIndexes = await queryInterface.showIndex(TABLE);
  let changed = false;
  for (const index of TABLE_INDEXES) {
    if (hasIndex(existingIndexes, index.name)) continue;
    await queryInterface.addIndex(TABLE, index.fields, {
      name: index.name,
      unique: Boolean(index.unique),
    });
    console.log(`[Schema] Added missing index ${index.name} on ${TABLE}`);
    changed = true;
  }
  return changed;
};

export const ensureIntegrationWebhookEventsTable = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableCreated = await ensureTableExists(queryInterface);
  const columnsChanged = tableCreated
    ? false
    : await ensureMissingColumns(queryInterface);
  const indexesChanged = await ensureMissingIndexes(queryInterface);
  return tableCreated || columnsChanged || indexesChanged;
};

export default ensureIntegrationWebhookEventsTable;
