// BW-FIX-007 / BW-FIX-008 — V1 final architecture reconciliation, schema half.
//
// BW-FIX-007  birthwave_contacts.client_id had NO foreign key in the database.
//   BirthwaveContactTable declares `references: { model: clients, key: "id" }`,
//   but 20260907_birthwave_contact_foundation created the table itself with a
//   plain `client_id: { type: INTEGER, allowNull: false }` and no constraint.
//   Because the table already existed by the time db.sequelize.sync() ran,
//   sync() never added the constraint either (sync() creates missing tables;
//   it does not add constraints to existing ones). Every other Birthwave table
//   carries a real client FK, so Contact — the tenant-scoped person identity
//   that the (client_id, normalized_phone) uniqueness rests on — was the one
//   place where a bad client_id could be written and cross-tenant integrity
//   was unenforced at the database level. ON DELETE CASCADE matches the other
//   contact-era tables (teams, team_members, lead_assignments, cursors, rules,
//   tasks, dispositions, attention_items).
//
// BW-FIX-008  birthwave_leads.status still defaulted to the legacy 'new_lead'.
//   BW-FIX-002 normalized the stored rows and the application writers to the
//   canonical stage vocabulary, but left the column default behind, so any
//   INSERT that omits status silently writes a legacy value and re-introduces
//   the mixed vocabulary that BW-FIX-002 exists to prevent. This changes only
//   the DEFAULT; no stored row is touched (all 21 rows are already canonical,
//   verified case-sensitively with GROUP BY BINARY status).
//
// Neither change drops anything, and both are reversible.

const CONTACTS = "birthwave_contacts";
const LEADS = "birthwave_leads";
const CONTACT_CLIENT_FK = "fk_bw_contacts_client";

const STATUS_COLUMN = (Sequelize, defaultValue) => ({
  type: Sequelize.STRING(50),
  allowNull: false,
  defaultValue,
});

const constraintNames = (rows) =>
  new Set(rows.map((row) => String(row.constraintName || row.name || "").toLowerCase()));

export const name = "20260909_birthwave_v1_reconciliation_fixes";

export async function up({ context: qi, Sequelize }) {
  const existing = constraintNames(await qi.showConstraint(CONTACTS));
  if (!existing.has(CONTACT_CLIENT_FK.toLowerCase())) {
    await qi.addConstraint(CONTACTS, {
      fields: ["client_id"],
      type: "foreign key",
      name: CONTACT_CLIENT_FK,
      references: { table: "clients", field: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  }

  await qi.changeColumn(LEADS, "status", STATUS_COLUMN(Sequelize, "NEW"));
}

export async function down({ context: qi, Sequelize }) {
  const existing = constraintNames(await qi.showConstraint(CONTACTS));
  if (existing.has(CONTACT_CLIENT_FK.toLowerCase())) {
    await qi.removeConstraint(CONTACTS, CONTACT_CLIENT_FK);
  }

  await qi.changeColumn(LEADS, "status", STATUS_COLUMN(Sequelize, "new_lead"));
}

export default { name, up, down };
