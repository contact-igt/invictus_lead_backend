/**
 * BW-SVC-001 — dynamic Birthwave service master verification.
 *
 * Covers scenarios A–J of the refactor brief: seeding, website / manual / landing
 * / Repli intake, unknown-value safety, rename, deactivation, routing by
 * service_id, and the "Not sure yet" fallback.
 *
 * Restricted to local/development databases; every fixture is removed in the
 * finally block.
 */
import assert from "node:assert/strict";
import { Op } from "sequelize";
import db from "../database/index.js";
import { createLead, updateLead, listLeads } from "../modules/birthwave/birthwave.service.js";
import { createWebsiteLead } from "../modules/birthwave/birthwaveWebsiteLead.service.js";
import {
  listServices,
  listActiveServicesForPublic,
  createService,
  updateService,
  reorderServices,
  resolveServiceForIntake,
  getSystemFallbackService,
} from "../modules/birthwave/birthwaveService.service.js";
import {
  createAssignmentRule,
  routeLeadByRules,
} from "../modules/birthwave/birthwaveAssignment.service.js";
import { BIRTHWAVE_SEED_SERVICES } from "../database/migrations/20260910_birthwave_services_master.js";

if (!["local", "development"].includes(process.env.INVICTUS_SERVER_LINE || "local")) {
  throw new Error("Dynamic services verification is restricted to local/development databases");
}

const clients = await db.Client.findAll({ order: [["id", "ASC"]], limit: 2, attributes: ["id"] });
assert.ok(clients.length >= 2, "At least two local clients are required");
const clientId = clients[0].id;
const otherClientId = clients[1].id;
const tenant = { id: clientId };
const admin = { id: 0, role: "client" };
const suffix = Date.now();

const checks = [];
const pass = (label) => checks.push(label);

const leadIds = [];
const createdServiceIds = [];
const ruleIds = [];
let team;
let member;
let renamedServiceId = null;
let originalName = null;
let deactivatedServiceId = null;

const makeLead = async (data) => {
  const lead = await createLead(tenant, {
    name: `SVC ${suffix} ${leadIds.length}`,
    phone: `+9198${String(suffix).slice(-7)}${leadIds.length}`,
    source: "referral",
    custom_fields: {},
    ...data,
  }, admin);
  leadIds.push(lead.id);
  return lead;
};

try {
  // ── A. Seed ───────────────────────────────────────────────────────────────
  const seeded = await listServices(tenant, {});
  const seededSlugs = seeded.map((row) => row.slug);
  for (const service of BIRTHWAVE_SEED_SERVICES) {
    assert.ok(seededSlugs.includes(service.slug), `approved service "${service.slug}" is seeded`);
  }
  const fallback = seeded.find((row) => row.slug === "not-sure-yet");
  assert.ok(fallback?.is_system, "Not sure yet is flagged is_system");
  assert.ok(fallback.is_active, "Not sure yet is active");
  const ordered = seeded.map((row) => row.sort_order);
  assert.deepEqual([...ordered].sort((a, b) => a - b), ordered, "services come back in sort order");
  pass("A-seed-approved-services");

  const vbac = seeded.find((row) => row.slug === "vbac");
  const fertility = seeded.find((row) => row.slug === "fertility-preconception");
  const pregnancy = seeded.find((row) => row.slug === "pregnancy-antenatal-care");
  assert.ok(vbac && fertility && pregnancy, "core services resolved");

  // Tenant isolation: another client's services must not leak in.
  const otherServices = await listServices({ id: otherClientId }, {});
  assert.equal(
    otherServices.some((row) => seeded.some((s) => s.id === row.id)),
    false,
    "service master is tenant scoped",
  );
  pass("A-tenant-isolation");

  // ── B. Website intake by service_id ───────────────────────────────────────
  const web = await createWebsiteLead(clientId, {
    source_key: "birthwave_website",
    name: `SVC Web ${suffix}`,
    phone: `+9195${String(suffix).slice(-8)}`,
    service_id: fertility.id,
    external_submission_id: `svc-web-${suffix}`,
  }, { skipSheetSync: true });
  leadIds.push(web.birthwave_lead_id);
  const webLead = await db.BirthwaveLead.findByPk(web.birthwave_lead_id);
  assert.equal(webLead.service_id, fertility.id, "website Lead stores the Fertility service_id");
  assert.equal(webLead.service, fertility.name, "website Lead's legacy text mirrors the service name");
  pass("B-website-service-id");

  // ── C. Manual Add Lead by service_id ──────────────────────────────────────
  const manual = await makeLead({ service_id: vbac.id });
  assert.equal(manual.service_id, vbac.id, "manual Lead stores the VBAC service_id");
  assert.equal(manual.service, vbac.name, "manual Lead exposes the VBAC display name");
  pass("C-manual-service-id");

  // ── D. Landing page by stable slug ────────────────────────────────────────
  const landing = await createWebsiteLead(clientId, {
    source_key: "birthwave_vbac",
    name: `SVC Landing ${suffix}`,
    phone: `+9194${String(suffix).slice(-8)}`,
    service_slug: "vbac",
    external_submission_id: `svc-landing-${suffix}`,
  }, { skipSheetSync: true });
  leadIds.push(landing.birthwave_lead_id);
  const landingLead = await db.BirthwaveLead.findByPk(landing.birthwave_lead_id);
  assert.equal(landingLead.service_id, vbac.id, "landing page slug resolves to the VBAC service");
  pass("D-landing-slug-resolves");

  // ── E. Repli external text maps to a service ──────────────────────────────
  const repliMatch = await resolveServiceForIntake({ clientId, text: "Fertility & Preconception" });
  assert.equal(repliMatch.service?.id, fertility.id, "Repli text maps to the Fertility service");
  const repliSlugMatch = await resolveServiceForIntake({ clientId, text: "vbac" });
  assert.equal(repliSlugMatch.service?.id, vbac.id, "Repli slug-shaped text maps to VBAC");
  pass("E-repli-known-value-maps");

  // ── F. Unknown Repli value is never guessed ───────────────────────────────
  const unknown = await resolveServiceForIntake({ clientId, text: "Totally Unknown Offering XYZ" });
  assert.equal(unknown.service, null, "an unrecognised value resolves to no service, never a guess");
  const systemFallback = await getSystemFallbackService(clientId);
  assert.equal(systemFallback.slug, "not-sure-yet", "the protected fallback is available for the caller to choose");
  pass("F-unknown-value-not-guessed");

  // An unrecognised value on an authenticated Lead keeps the text and leaves
  // service_id null rather than mis-filing the Lead.
  const looseLead = await makeLead({ service: "Totally Unknown Offering XYZ" });
  assert.equal(looseLead.service_id, null, "unmatched free text leaves service_id NULL");
  assert.equal(looseLead.service, "Totally Unknown Offering XYZ", "unmatched free text is preserved verbatim");
  pass("F-unmatched-text-preserved");

  // ── I. Routing by service_id ──────────────────────────────────────────────
  team = await db.BirthwaveTeam.create({ client_id: clientId, name: `SVC Team ${suffix}`, code: `svc_${suffix}` });
  const management = await db.Management.create({
    client_id: clientId, title: "Mr", username: `svc-user-${suffix}`,
    email: `svc-${suffix}@example.test`, mobile: `97${String(suffix).slice(-8)}`,
    password: "verification-only", role: "client",
  });
  member = await db.BirthwaveTeamMember.create({
    client_id: clientId, team_id: team.id, management_id: management.id,
    operational_role: "TELECALLER", status: "ACTIVE", assignment_enabled: true,
    // Stored as a SLUG so the entry survives the rename below.
    service_access: ["fertility-preconception"],
  });
  const rule = await createAssignmentRule(tenant, {
    name: `SVC Rule ${suffix}`, priority: 1, service_id: fertility.id,
    source: "referral", team_id: team.id, assignment_method: "ROUND_ROBIN",
  }, admin);
  ruleIds.push(rule.id);
  assert.equal(rule.service_id, fertility.id, "rule stores service_id");

  const routed = await makeLead({ service_id: fertility.id, source: "referral" });
  const routeResult = await routeLeadByRules({ tenant, leadId: routed.id, actor: admin });
  assert.ok(routeResult.assigned, "service_id + source routed the Lead to the rule's team");
  const routedRow = await db.BirthwaveLead.findByPk(routed.id);
  assert.equal(routedRow.current_team_id, team.id, "Lead landed on the expected team");
  pass("I-routing-by-service-id");

  // ── G. Rename must not break anything ─────────────────────────────────────
  originalName = fertility.name;
  renamedServiceId = fertility.id;
  await updateService(tenant, fertility.id, { name: "Fertility, PCOS & Preconception Care" }, admin);

  const afterRename = await db.BirthwaveLead.findByPk(routed.id);
  assert.equal(afterRename.service_id, fertility.id, "renaming does not move the Lead's service_id");

  const listed = await listLeads(tenant, { service_id: fertility.id, limit: 200 }, admin);
  assert.ok(listed.data.some((row) => row.id === routed.id), "service_id filtering still finds the Lead after a rename");
  const displayed = listed.data.find((row) => row.id === routed.id);
  assert.equal(displayed.service, "Fertility, PCOS & Preconception Care", "the Lead displays the NEW service name");

  // Routing must still work: the rule and the member's slug-based access both
  // survive because neither depends on the display name.
  const routed2 = await makeLead({ service_id: fertility.id, source: "referral" });
  const routeResult2 = await routeLeadByRules({ tenant, leadId: routed2.id, actor: admin });
  assert.ok(routeResult2.assigned, "routing still works after the service was renamed");
  pass("G-rename-preserves-leads-filters-routing");

  // ── H. Deactivation ───────────────────────────────────────────────────────
  const temp = await createService(tenant, { name: `SVC Temp ${suffix}`, slug: `svc-temp-${suffix}` }, admin);
  createdServiceIds.push(temp.id);
  const tempLead = await makeLead({ service_id: temp.id });
  await updateService(tenant, temp.id, { is_active: false }, admin);
  deactivatedServiceId = temp.id;

  const publicList = await listActiveServicesForPublic(clientId);
  assert.equal(publicList.some((row) => row.id === temp.id), false, "an inactive service is not offered to new website enquiries");
  const activeAdminList = await listServices(tenant, { active: true });
  assert.equal(activeAdminList.some((row) => row.id === temp.id), false, "an inactive service is excluded from active-only lists");

  await assert.rejects(
    () => makeLead({ service_id: temp.id }),
    (error) => error.status === 400,
    "a new Lead cannot select an inactive service",
  );

  const historical = await listLeads(tenant, { service_id: temp.id, limit: 50 }, admin);
  const historicalRow = historical.data.find((row) => row.id === tempLead.id);
  assert.ok(historicalRow, "an existing Lead on a deactivated service is still listed");
  assert.equal(historicalRow.service, temp.name, "an existing Lead still displays its deactivated service name");
  assert.equal(historicalRow.service_ref?.is_active, false, "the API marks that service as inactive");
  pass("H-deactivation-hides-new-shows-historical");

  // ── J. Not sure yet ───────────────────────────────────────────────────────
  const notSure = await makeLead({ service_id: fallback.id });
  assert.equal(notSure.service_id, fallback.id, "a patient may choose Not sure yet");
  // The telecaller later establishes the real service.
  const corrected = await updateLead(tenant, notSure.id, { service_id: pregnancy.id }, admin);
  assert.equal(corrected.service_id, pregnancy.id, "the telecaller can correct the service afterwards");
  assert.equal(corrected.service, pregnancy.name, "the legacy text follows the correction");
  pass("J-not-sure-yet-fallback-then-correction");

  // The system service is protected.
  await assert.rejects(
    () => updateService(tenant, fallback.id, { is_active: false }, admin),
    (error) => error.status === 409,
    "the system fallback service cannot be deactivated",
  );
  await assert.rejects(
    () => updateService(tenant, fallback.id, { slug: "something-else" }, admin),
    (error) => error.status === 409,
    "the system service slug cannot be changed",
  );
  pass("J-system-service-protected");

  // ── Admin CRUD + permissions ──────────────────────────────────────────────
  const added = await createService(tenant, { name: `SVC Extra ${suffix}` }, admin);
  createdServiceIds.push(added.id);
  assert.ok(added.slug.startsWith("svc-extra-"), "slug is derived from the name when omitted");
  assert.equal(added.is_system, false, "services created through the API are never system services");

  await assert.rejects(
    () => createService(tenant, { name: "Duplicate", slug: "vbac" }, admin),
    (error) => error.status === 409,
    "slug is unique within the tenant",
  );
  // ...but the same slug is fine for a different tenant.
  const otherTenantService = await createService({ id: otherClientId }, { name: "VBAC elsewhere", slug: "vbac" }, admin);
  createdServiceIds.push(otherTenantService.id);
  assert.equal(otherTenantService.slug, "vbac", "the same slug may exist for another client");
  pass("admin-crud-and-slug-scope");

  const reordered = await reorderServices(tenant, [vbac.id, fertility.id], admin);
  assert.equal(reordered.find((row) => row.id === vbac.id).sort_order, 10, "reorder applies the new sort order");
  pass("admin-reorder");

  const telecaller = { id: member.management_id, role: "telecaller" };
  await assert.rejects(() => createService(tenant, { name: "Nope" }, telecaller), (error) => error.status === 403, "telecaller cannot create a service");
  await assert.rejects(() => updateService(tenant, vbac.id, { name: "Nope" }, telecaller), (error) => error.status === 403, "telecaller cannot edit a service");
  await assert.rejects(() => reorderServices(tenant, [vbac.id], telecaller), (error) => error.status === 403, "telecaller cannot reorder services");
  const readable = await listServices(tenant, { active: true });
  assert.ok(readable.length > 0, "active services remain readable for Lead forms");
  pass("permissions-admin-only-writes");

  // Cross-tenant guard: a service from another client must be rejected.
  await assert.rejects(
    () => makeLead({ service_id: otherTenantService.id }),
    (error) => error.status === 400,
    "a Lead cannot reference another client's service",
  );
  pass("cross-tenant-service-rejected");

  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  if (renamedServiceId && originalName) {
    await db.BirthwaveService.update({ name: originalName }, { where: { id: renamedServiceId } });
  }
  if (deactivatedServiceId) {
    await db.BirthwaveService.update({ is_active: true }, { where: { id: deactivatedServiceId } });
  }
  const ids = leadIds.filter(Boolean);
  if (ids.length) {
    await db.BirthwaveAttentionItem.destroy({ where: { client_id: clientId, lead_id: ids } });
    await db.BirthwaveDisposition.destroy({ where: { client_id: clientId, lead_id: ids } });
    await db.BirthwaveAppointment.destroy({ where: { client_id: clientId, lead_id: ids } });
    await db.BirthwaveTask.update({ parent_task_id: null }, { where: { client_id: clientId, lead_id: ids } });
    await db.BirthwaveTask.destroy({ where: { client_id: clientId, lead_id: ids } });
    await db.BirthwaveLeadActivity.destroy({ where: { client_id: clientId, lead_id: ids } });
    await db.BirthwaveLeadAssignment.destroy({ where: { client_id: clientId, lead_id: ids } });
    await db.BirthwaveWebsiteLead.destroy({ where: { client_id: clientId, birthwave_lead_id: ids } });
    await db.BirthwaveLead.destroy({ where: { client_id: clientId, id: ids } });
  }
  if (ruleIds.length) await db.BirthwaveAssignmentRule.destroy({ where: { id: ruleIds } });
  if (createdServiceIds.length) await db.BirthwaveService.destroy({ where: { id: createdServiceIds } });
  if (team) {
    await db.BirthwaveAssignmentCursor.destroy({ where: { client_id: clientId, team_id: team.id } });
    await db.BirthwaveTeamMember.destroy({ where: { client_id: clientId, team_id: team.id } });
    await db.BirthwaveTeam.destroy({ where: { client_id: clientId, id: team.id } });
  }
  if (member) await db.Management.destroy({ where: { client_id: clientId, id: member.management_id } });
  await db.BirthwaveContact.destroy({ where: { client_id: clientId, display_name: { [Op.like]: `SVC %${suffix}%` } } });
  await db.sequelize.close();
}
