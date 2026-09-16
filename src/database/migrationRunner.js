import { SequelizeStorage, Umzug } from "umzug";
import db from "./index.js";
import contactFoundation from "./migrations/20260907_birthwave_contact_foundation.js";
import teamsAssignment from "./migrations/20260907_birthwave_teams_assignment.js";
import tasks from "./migrations/20260907_birthwave_tasks.js";
import dispositions from "./migrations/20260907_birthwave_dispositions.js";
import attentionItems from "./migrations/20260907_birthwave_attention_items.js";
import fkDuplicateCleanup from "./migrations/20260908_birthwave_fk_duplicate_cleanup.js";
import leadStatusStageNormalization from "./migrations/20260908_birthwave_lead_status_stage_normalization.js";
import v1ReconciliationFixes from "./migrations/20260909_birthwave_v1_reconciliation_fixes.js";
import servicesMaster from "./migrations/20260910_birthwave_services_master.js";

const migrationContext = db.sequelize.getQueryInterface();
const migrations = [
  {
    name: contactFoundation.name,
    up: ({ context }) => contactFoundation.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => contactFoundation.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: teamsAssignment.name,
    up: ({ context }) => teamsAssignment.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => teamsAssignment.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: tasks.name,
    up: ({ context }) => tasks.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => tasks.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: dispositions.name,
    up: ({ context }) => dispositions.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => dispositions.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: attentionItems.name,
    up: ({ context }) => attentionItems.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => attentionItems.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: fkDuplicateCleanup.name,
    up: ({ context }) => fkDuplicateCleanup.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => fkDuplicateCleanup.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: leadStatusStageNormalization.name,
    up: ({ context }) => leadStatusStageNormalization.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => leadStatusStageNormalization.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: v1ReconciliationFixes.name,
    up: ({ context }) => v1ReconciliationFixes.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => v1ReconciliationFixes.down({ context, Sequelize: db.Sequelize }),
  },
  {
    name: servicesMaster.name,
    up: ({ context }) => servicesMaster.up({ context, Sequelize: db.Sequelize }),
    down: ({ context }) => servicesMaster.down({ context, Sequelize: db.Sequelize }),
  },
];

const umzug = new Umzug({
  migrations,
  context: migrationContext,
  storage: new SequelizeStorage({
    sequelize: db.sequelize,
    modelName: "BirthwaveSchemaMigration",
    tableName: "birthwave_schema_migrations",
  }),
  logger: undefined,
});

export const migrationStatus = async () => {
  const executed = new Set((await umzug.executed()).map((migration) => migration.name));
  return migrations.map((migration) => ({ name: migration.name, applied: executed.has(migration.name) }));
};

export const migrateUp = async () => {
  const result = await umzug.up();
  return result.map((migration) => ({ name: migration.name, action: "applied" }));
};

export const migrateDown = async () => {
  const result = await umzug.down({ step: 1 });
  return result.map((migration) => ({ name: migration.name, action: "reverted" }));
};

const main = async () => {
  const command = process.argv[2] || "status";
  const result = command === "up"
    ? await migrateUp()
    : command === "down"
      ? await migrateDown()
      : await migrationStatus();
  console.log(JSON.stringify(result, null, 2));
};

if (process.argv[1]?.endsWith("migrationRunner.js")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.sequelize.close());
}
