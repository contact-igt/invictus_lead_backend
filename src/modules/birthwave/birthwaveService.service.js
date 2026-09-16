import { Op } from "sequelize";
import db from "../../database/index.js";
import {
  BIRTHWAVE_SYSTEM_SERVICE_SLUG,
  normalizeServiceSlug,
} from "../../database/tables/BirthwaveServiceTable/index.js";
import { isTenantAdmin } from "./birthwavePermissions.service.js";

/**
 * BW-SVC-001 — the Birthwave service master.
 *
 * Every service reference in the system resolves through here: the public
 * website form, landing pages, manual Add Lead, Repli normalisation, Lead
 * filters and assignment rules. There is exactly one master table and one
 * canonical reference (`service_id`) — see §26/§27 of the refactor brief.
 */

const httpError = (status, message) => Object.assign(new Error(message), { status });

const clientIdOf = (tenant) => {
  const id = Number(tenant?.id);
  if (!id) throw httpError(403, "A valid client context is required");
  return id;
};

const assertAdmin = (actor) => {
  if (!isTenantAdmin(actor)) throw httpError(403, "Only Birthwave administrators can manage services");
};

export const serializeService = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  is_active: Boolean(row.is_active),
  sort_order: row.sort_order,
  is_system: Boolean(row.is_system),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/** Public/website shape — only what a form needs, no admin metadata. */
export const serializePublicService = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  sort_order: row.sort_order,
});

export const listServices = async (tenant, query = {}) => {
  const clientId = clientIdOf(tenant);
  const where = { client_id: clientId };
  // Admin surfaces list everything; forms ask for active only.
  if (query.active === true || query.active === "true") where.is_active = true;
  if (query.active === false || query.active === "false") where.is_active = false;
  if (query.search) where.name = { [Op.like]: `%${String(query.search).trim()}%` };
  const rows = await db.BirthwaveService.findAll({
    where,
    order: [["sort_order", "ASC"], ["name", "ASC"], ["id", "ASC"]],
  });
  return rows.map(serializeService);
};

export const listActiveServicesForPublic = async (clientId) => {
  const rows = await db.BirthwaveService.findAll({
    where: { client_id: Number(clientId), is_active: true },
    order: [["sort_order", "ASC"], ["name", "ASC"], ["id", "ASC"]],
  });
  return rows.map(serializePublicService);
};

const assertSlugFree = async (clientId, slug, exceptId = null) => {
  const clash = await db.BirthwaveService.findOne({
    where: { client_id: clientId, slug, ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) },
    attributes: ["id"],
  });
  if (clash) throw httpError(409, `A service with the slug "${slug}" already exists`);
};

export const createService = async (tenant, data, actor) => {
  assertAdmin(actor);
  const clientId = clientIdOf(tenant);
  const name = String(data.name || "").trim();
  if (!name) throw httpError(400, "Service name is required");
  const slug = normalizeServiceSlug(data.slug || name);
  if (!slug) throw httpError(400, "A valid service slug is required");
  await assertSlugFree(clientId, slug);

  const maxOrder = await db.BirthwaveService.max("sort_order", { where: { client_id: clientId } });
  const row = await db.BirthwaveService.create({
    client_id: clientId,
    name,
    slug,
    is_active: data.is_active === undefined ? true : Boolean(data.is_active),
    sort_order: data.sort_order !== undefined ? Number(data.sort_order) : Number(maxOrder || 0) + 10,
    // is_system is never settable through the API — only the seed migration
    // creates system services, so a tenant cannot mint an undeletable service.
    is_system: false,
  });
  return serializeService(row);
};

export const updateService = async (tenant, id, data, actor) => {
  assertAdmin(actor);
  const clientId = clientIdOf(tenant);
  const row = await db.BirthwaveService.findOne({ where: { client_id: clientId, id } });
  if (!row) throw httpError(404, "Service not found");

  const patch = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw httpError(400, "Service name cannot be empty");
    // Renaming is always safe: Leads and rules reference this row by id, so a
    // new name flows straight through to history, filters and routing.
    patch.name = name;
  }
  if (data.slug !== undefined) {
    const slug = normalizeServiceSlug(data.slug);
    if (!slug) throw httpError(400, "A valid service slug is required");
    if (row.is_system && slug !== row.slug) {
      // Landing pages and the Repli fallback pin to this slug.
      throw httpError(409, "The system service slug cannot be changed");
    }
    if (slug !== row.slug) await assertSlugFree(clientId, slug, row.id);
    patch.slug = slug;
  }
  if (data.sort_order !== undefined) patch.sort_order = Number(data.sort_order);
  if (data.is_active !== undefined) {
    const nextActive = Boolean(data.is_active);
    // "Not sure yet" is the fallback the whole intake flow leans on (a patient
    // may legitimately pick it, and Repli routes unmatched values nowhere else),
    // so it must stay selectable.
    if (row.is_system && !nextActive) {
      throw httpError(409, "The system fallback service cannot be deactivated");
    }
    patch.is_active = nextActive;
  }

  await row.update(patch);
  return serializeService(row);
};

export const reorderServices = async (tenant, order, actor) => {
  assertAdmin(actor);
  const clientId = clientIdOf(tenant);
  if (!Array.isArray(order) || !order.length) throw httpError(400, "An ordered list of service ids is required");
  const rows = await db.BirthwaveService.findAll({ where: { client_id: clientId, id: { [Op.in]: order } }, attributes: ["id"] });
  if (rows.length !== order.length) throw httpError(400, "One or more services do not belong to this client");
  await db.sequelize.transaction(async (transaction) => {
    for (const [index, id] of order.entries()) {
      await db.BirthwaveService.update({ sort_order: (index + 1) * 10 }, { where: { client_id: clientId, id }, transaction });
    }
  });
  return listServices(tenant, {});
};

// ── Resolution helpers used by every intake path ──────────────────────────────

/**
 * Resolves a service for a tenant from an id or a slug.
 *
 * `requireActive` is true for new Leads (an inactive service must not be
 * selectable) and false when re-reading an existing Lead, so a Lead created
 * against a service that has since been retired still resolves and displays.
 */
export const resolveService = async ({ clientId, serviceId, slug, requireActive = true, transaction }) => {
  const where = { client_id: Number(clientId) };
  if (serviceId) where.id = Number(serviceId);
  else if (slug) where.slug = normalizeServiceSlug(slug);
  else return null;

  const row = await db.BirthwaveService.findOne({ where, ...(transaction ? { transaction } : {}) });
  if (!row) return null;
  if (requireActive && !row.is_active) return null;
  return row;
};

/** The protected fallback ("Not sure yet"), used when nothing else resolves. */
export const getSystemFallbackService = async (clientId, transaction) =>
  db.BirthwaveService.findOne({
    where: { client_id: Number(clientId), slug: BIRTHWAVE_SYSTEM_SERVICE_SLUG },
    ...(transaction ? { transaction } : {}),
  });

/**
 * Resolves the service for an inbound Lead and returns both canonical id and the
 * compatibility text to store on `birthwave_leads.service`.
 *
 * Order: explicit service_id → explicit slug → exact/normalised name match on
 * free text. Unrecognised free text is NEVER guessed into a service — the
 * caller decides whether to fall back (Repli) or reject (authenticated forms).
 */
export const resolveServiceForIntake = async ({ clientId, serviceId, slug, text, transaction }) => {
  if (serviceId) {
    const byId = await resolveService({ clientId, serviceId, requireActive: true, transaction });
    if (!byId) throw httpError(400, "Selected service is not available for this client");
    return { service: byId, matchedBy: "id" };
  }
  if (slug) {
    const bySlug = await resolveService({ clientId, slug, requireActive: true, transaction });
    if (bySlug) return { service: bySlug, matchedBy: "slug" };
  }
  const raw = String(text || "").trim();
  if (raw) {
    const normalized = normalizeServiceSlug(raw);
    const candidates = await db.BirthwaveService.findAll({
      where: { client_id: Number(clientId), is_active: true },
      ...(transaction ? { transaction } : {}),
    });
    const byName = candidates.find((row) => row.name.trim().toLowerCase() === raw.toLowerCase());
    if (byName) return { service: byName, matchedBy: "name" };
    const bySlugText = candidates.find((row) => row.slug === normalized);
    if (bySlugText) return { service: bySlugText, matchedBy: "slug-from-text" };
  }
  return { service: null, matchedBy: null };
};

export default {
  listServices,
  listActiveServicesForPublic,
  createService,
  updateService,
  reorderServices,
  resolveService,
  getSystemFallbackService,
  resolveServiceForIntake,
  serializeService,
  serializePublicService,
};
