import { tableName } from "../tableName.js";

/**
 * BW-SVC-001 — the single Birthwave service master.
 *
 * One row per service per tenant. Everything that used to hold a service as free
 * text (Lead forms, the public website payload, assignment rules, Repli
 * normalisation) resolves to a row here, and Leads/rules reference it by
 * `service_id` so renaming a service can never break routing or history.
 *
 * The table is created and seeded by 20260910_birthwave_services_master; this
 * model only describes it.
 */

/** The protected fallback a patient can legitimately choose. */
export const BIRTHWAVE_SYSTEM_SERVICE_SLUG = "not-sure-yet";

/**
 * Slugs are the stable identity used by landing pages and by Repli mapping —
 * a service can be renamed freely, but its slug is what external callers pin to.
 */
export const normalizeServiceSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’'"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

export const BirthwaveServiceTable = (Sequelize, sequelize) => sequelize.define(
  "BirthwaveService",
  {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: tableName.CLIENTS, key: "id" } },
    name: { type: Sequelize.STRING(160), allowNull: false },
    slug: { type: Sequelize.STRING(160), allowNull: false },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    // System services (currently only "Not sure yet") are the workflow's
    // fallback and must never be hard-deleted or deactivated.
    is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: tableName.BIRTHWAVE_SERVICES,
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { name: "uq_bw_services_client_slug", unique: true, fields: ["client_id", "slug"] },
      { name: "idx_bw_services_client_active_order", fields: ["client_id", "is_active", "sort_order"] },
    ],
  },
);

export default BirthwaveServiceTable;
