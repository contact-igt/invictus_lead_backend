// BW-SVC-001 — Dynamic Birthwave service master.
//
// Before this migration a Birthwave "service" was free text everywhere: a plain
// TextField on Add Lead and on Assignment Rules, a free-text field on the public
// website payload, and whatever string Repli happened to send. Nothing tied those
// strings together, so renaming a service silently broke routing
// (birthwave_assignment_rules.service === birthwave_leads.service) and member
// eligibility (birthwave_team_members.service_access contains service names).
//
// This creates the single service master and the two canonical ID references:
//
//   birthwave_services                     the master (per tenant)
//   birthwave_leads.service_id             the Lead's service
//   birthwave_assignment_rules.service_id  the routing criterion
//
// The legacy `service` text columns are deliberately NOT dropped — they stay as
// compatibility while every writer/reader is migrated and verified.
//
// Seeding is tenant-scoped and idempotent. A "Birthwave tenant" is any client
// whose client_key resolves to the birthwave module (`birthwave` or
// `birthwave_*`, matching extractClientModuleKey) OR any client that already
// owns rows in birthwave_leads — the latter covers development databases where
// Birthwave data was seeded onto another client before the birthwave client
// existed.

const SERVICES = "birthwave_services";
const LEADS = "birthwave_leads";
const RULES = "birthwave_assignment_rules";

// The approved V1 Birthwave service list, in display order. Not extended here —
// new services are added by an administrator through the Services admin screen.
export const BIRTHWAVE_SEED_SERVICES = [
  { name: "Not sure yet", slug: "not-sure-yet", is_system: true },
  { name: "Pregnancy & Antenatal Care", slug: "pregnancy-antenatal-care" },
  { name: "Normal Birth & Delivery Care", slug: "normal-birth-delivery-care" },
  { name: "VBAC (Vaginal Birth After Caesarean)", slug: "vbac" },
  { name: "Fertility & Preconception", slug: "fertility-preconception" },
  { name: "Vaginismus & Intimate Wellness", slug: "vaginismus-intimate-wellness" },
  { name: "Gynaecology & Women’s Wellness", slug: "gynaecology-womens-wellness" },
  { name: "Lactation & Breastfeeding Support", slug: "lactation-breastfeeding-support" },
  { name: "Birth Preparation & Childbirth Education", slug: "birth-preparation-childbirth-education" },
  { name: "Postpartum Recovery & Care", slug: "postpartum-recovery-care" },
  { name: "Nutrition & Emotional Well-being", slug: "nutrition-emotional-wellbeing" },
  { name: "Newborn & Pediatric Care", slug: "newborn-pediatric-care" },
  { name: "Natural Birth", slug: "natural-birth" },
];

// Explicit, reviewed mapping from the exact service strings found in the live
// database to a seeded service slug. Deliberately exhaustive rather than fuzzy:
// an unrecognised value is left NULL and reported, never guessed and never
// silently swept into "Not sure yet" (which is a patient's own answer, not an
// "unknown" bucket). "Newborn" and "Pediatrics" both map to the single approved
// "Newborn & Pediatric Care" service.
const LEGACY_TEXT_TO_SLUG = {
  "vbac": "vbac",
  "pregnancy care": "pregnancy-antenatal-care",
  "fertility": "fertility-preconception",
  "vaginismus": "vaginismus-intimate-wellness",
  "newborn": "newborn-pediatric-care",
  "pediatrics": "newborn-pediatric-care",
  "natural birth": "natural-birth",
  "not sure yet": "not-sure-yet",
};

const names = (rows) => new Set(rows.map((row) => String(row.name || "").toLowerCase()));
const constraintNames = (rows) =>
  new Set(rows.map((row) => String(row.constraintName || row.name || "").toLowerCase()));
const hasColumn = (columns, name) => Object.prototype.hasOwnProperty.call(columns, name);

const createIfMissing = async (qi, table, definition) => {
  const tables = new Set((await qi.showAllTables()).map((name) => String(name).toLowerCase()));
  if (!tables.has(table)) await qi.createTable(table, definition);
};

const addIndexIfMissing = async (qi, table, fields, options) => {
  const existing = await qi.showIndex(table);
  if (!names(existing).has(options.name.toLowerCase())) await qi.addIndex(table, fields, options);
};

const addColumnIfMissing = async (qi, table, column, definition) => {
  const columns = await qi.describeTable(table);
  if (!hasColumn(columns, column)) await qi.addColumn(table, column, definition);
};

const removeColumnIfPresent = async (qi, table, column) => {
  const columns = await qi.describeTable(table);
  if (hasColumn(columns, column)) await qi.removeColumn(table, column);
};

const addForeignKeyIfMissing = async (qi, table, fields, name, references, onDelete = "RESTRICT") => {
  const constraints = constraintNames(await qi.showConstraint(table));
  if (!constraints.has(name.toLowerCase())) {
    await qi.addConstraint(table, { fields, type: "foreign key", name, references, onUpdate: "CASCADE", onDelete });
  }
};

const removeConstraintIfPresent = async (qi, table, name) => {
  const constraints = constraintNames(await qi.showConstraint(table));
  if (constraints.has(name.toLowerCase())) await qi.removeConstraint(table, name);
};

const select = (qi, sql, replacements) =>
  qi.sequelize.query(sql, { type: qi.sequelize.constructor.QueryTypes.SELECT, replacements });

export const name = "20260910_birthwave_services_master";

export async function up({ context: qi, Sequelize }) {
  // ── 1. Master table ──────────────────────────────────────────────────────
  await createIfMissing(qi, SERVICES, {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    client_id: { type: Sequelize.INTEGER, allowNull: false },
    name: { type: Sequelize.STRING(160), allowNull: false },
    slug: { type: Sequelize.STRING(160), allowNull: false },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });

  // Slug is unique per tenant, never globally — two clients may each have "vbac".
  await addIndexIfMissing(qi, SERVICES, ["client_id", "slug"], { name: "uq_bw_services_client_slug", unique: true });
  await addIndexIfMissing(qi, SERVICES, ["client_id", "is_active", "sort_order"], { name: "idx_bw_services_client_active_order" });
  await addForeignKeyIfMissing(qi, SERVICES, ["client_id"], "fk_bw_services_client", { table: "clients", field: "id" }, "CASCADE");

  // ── 2. Seed the approved list for every Birthwave tenant ─────────────────
  const tenants = await select(
    qi,
    `SELECT DISTINCT c.id
       FROM clients c
      WHERE c.client_key = 'birthwave'
         OR c.client_key LIKE 'birthwave\\_%'
         OR EXISTS (SELECT 1 FROM ${LEADS} l WHERE l.client_id = c.id)`,
  );

  for (const tenant of tenants) {
    const existing = await select(qi, `SELECT slug FROM ${SERVICES} WHERE client_id = :cid`, { cid: tenant.id });
    const present = new Set(existing.map((row) => row.slug));
    const missing = BIRTHWAVE_SEED_SERVICES
      .map((service, index) => ({ ...service, sort_order: (index + 1) * 10 }))
      .filter((service) => !present.has(service.slug));
    if (!missing.length) continue;
    await qi.bulkInsert(
      SERVICES,
      missing.map((service) => ({
        client_id: tenant.id,
        name: service.name,
        slug: service.slug,
        is_active: true,
        sort_order: service.sort_order,
        is_system: Boolean(service.is_system),
        created_at: new Date(),
        updated_at: new Date(),
      })),
    );
  }

  // ── 3. Canonical references ──────────────────────────────────────────────
  await addColumnIfMissing(qi, LEADS, "service_id", { type: Sequelize.INTEGER, allowNull: true });
  await addIndexIfMissing(qi, LEADS, ["client_id", "service_id"], { name: "idx_bw_leads_client_service" });
  // ON DELETE RESTRICT: a service that any Lead references must not be deletable.
  await addForeignKeyIfMissing(qi, LEADS, ["service_id"], "fk_bw_leads_service", { table: SERVICES, field: "id" }, "RESTRICT");

  await addColumnIfMissing(qi, RULES, "service_id", { type: Sequelize.INTEGER, allowNull: true });
  await addIndexIfMissing(qi, RULES, ["client_id", "service_id"], { name: "idx_bw_rules_client_service" });
  await addForeignKeyIfMissing(qi, RULES, ["service_id"], "fk_bw_rules_service", { table: SERVICES, field: "id" }, "RESTRICT");

  // ── 4. Backfill from the explicit mapping, tenant by tenant ──────────────
  for (const [text, slug] of Object.entries(LEGACY_TEXT_TO_SLUG)) {
    await qi.sequelize.query(
      `UPDATE ${LEADS} l
         JOIN ${SERVICES} s ON s.client_id = l.client_id AND s.slug = :slug
          SET l.service_id = s.id
        WHERE l.service_id IS NULL AND LOWER(TRIM(l.service)) = :text`,
      { replacements: { slug, text } },
    );
    await qi.sequelize.query(
      `UPDATE ${RULES} r
         JOIN ${SERVICES} s ON s.client_id = r.client_id AND s.slug = :slug
          SET r.service_id = s.id
        WHERE r.service_id IS NULL AND LOWER(TRIM(r.service)) = :text`,
      { replacements: { slug, text } },
    );
  }

  // ── 5. Report anything left unmapped — never guessed, never defaulted ────
  const unmapped = await select(
    qi,
    `SELECT client_id, service, COUNT(*) n FROM ${LEADS}
      WHERE service_id IS NULL AND service IS NOT NULL AND TRIM(service) <> ''
      GROUP BY client_id, service`,
  );
  if (unmapped.length) {
    console.warn(
      `[${name}] ${unmapped.length} unmapped Lead service value(s) left as service_id NULL (legacy text preserved):`,
      unmapped.map((row) => `client ${row.client_id} · "${row.service}" × ${row.n}`).join(" | "),
    );
  }
}

export async function down({ context: qi }) {
  // Drops only what this migration added. The legacy `service` text columns were
  // never touched, so every Lead and rule keeps its original service value and
  // the rollback is lossless.
  await removeConstraintIfPresent(qi, RULES, "fk_bw_rules_service");
  await removeColumnIfPresent(qi, RULES, "service_id");

  await removeConstraintIfPresent(qi, LEADS, "fk_bw_leads_service");
  await removeColumnIfPresent(qi, LEADS, "service_id");

  const tables = new Set((await qi.showAllTables()).map((table) => String(table).toLowerCase()));
  if (tables.has(SERVICES)) await qi.dropTable(SERVICES);
}

export default { name, up, down, BIRTHWAVE_SEED_SERVICES };
