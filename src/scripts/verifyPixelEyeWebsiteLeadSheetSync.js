// Pixel Eye landing-page leads: DB save first, then mirrored to that page's
// Google Sheet by the backend. Google is stubbed — no real sheet is touched.
import assert from "node:assert/strict";
import {
  PIXELEYE_SHEET_URLS,
  buildSheetFields,
  resolveSheetUrl,
  resolveSourceKey,
} from "../modules/pixelEyeWebsiteLeads/pixelEyeSheetSync.service.js";

// ── unit ──
assert.equal(resolveSourceKey({ service: "Cataract" }), "cataract");
assert.equal(resolveSourceKey({ service: "Lasik", source_key: "sanathnagar" }), "sanathnagar");
assert.equal(resolveSourceKey({ service: "Glaucoma", source_key: "bogus" }), "glaucoma");
assert.equal(resolveSourceKey({ service: "Anything Else" }), null);
assert.equal(Object.keys(PIXELEYE_SHEET_URLS).length, 9);
assert.equal(resolveSheetUrl("lasik", {}), PIXELEYE_SHEET_URLS.lasik);
assert.equal(resolveSheetUrl("lasik", { PIXELEYE_SHEET_URL_LASIK: "https://override.test/x" }), "https://override.test/x");
assert.deepEqual(
  buildSheetFields({ name: "A", mobile_number: "9876543210", service: "Squint", ip_address: "1.1.1.1", utm_source: "fb", source_key: "squint" }),
  { PatientName: "A", Name: "A", MobileNumber: "9876543210", Mobile: "9876543210", Service: "Squint", IP_Address: "1.1.1.1", utm_source: "fb", source_key: "squint" },
);
console.log("PixelEye sheet-sync unit checks passed.");

// ── integration (local DB only) ──
if (!["local", "development"].includes(process.env.INVICTUS_SERVER_LINE || "local")) {
  console.log(`INVICTUS_SERVER_LINE=${process.env.INVICTUS_SERVER_LINE}: integration section NOT run (local/development DBs only).`);
  process.exit(0);
}
const { default: db } = await import("../database/index.js");
const { ensurePixelEyeWebsiteLeadSheetSyncColumns } = await import("../database/migrations/ensurePixelEyeWebsiteLeadSheetSyncColumns.js");
const svc = await import("../modules/pixelEyeWebsiteLeads/pixelEyeWebsiteLead.service.js");

let client = null;
try {
  client = await db.Client.findOne({ where: { client_key: "pixeleye" }, attributes: ["id"] })
    || await db.Client.findOne({ order: [["id", "ASC"]], attributes: ["id"] });
} catch (error) {
  console.log(`Local DB unavailable (${error?.name}) — integration section NOT run.`);
  process.exit(0);
}
if (!client) {
  console.log("No local client — integration section NOT run.");
  process.exit(0);
}

await ensurePixelEyeWebsiteLeadSheetSyncColumns();

const realFetch = globalThis.fetch;
const origError = console.error;
const calls = [];
let googleMode = "ok";
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), body: Object.fromEntries(new URLSearchParams(String(options.body))) });
  if (googleMode === "fail") return { ok: false, status: 500, text: async () => "boom" };
  return { ok: true, status: 200, text: async () => '{"result":"success"}' };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));
const suffix = String(Date.now()).slice(-6);
const ids = [];
const make = async (extra) => {
  const row = await svc.createPixelEyeWebsiteLeadPublicRecord(
    { name: `SheetTest ${suffix}`, mobile_number: `98${suffix}01`, ip_address: "9.9.9.9", utm_source: "direct", ...extra },
    client.id,
  );
  ids.push(row.id);
  return row;
};

try {
  // Cataract resolved from service, mirrored to the cataract sheet exactly once.
  const cataract = await make({ service: "Cataract" });
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, PIXELEYE_SHEET_URLS.cataract);
  assert.equal(calls[0].body.PatientName, `SheetTest ${suffix}`);
  assert.equal((await db.PixelEyeWebsiteLead.findByPk(cataract.id)).sheet_sync_status, "synced");

  // Sanathnagar: explicit source_key wins over any service value.
  calls.length = 0;
  await make({ service: "Lasik", source_key: "sanathnagar" });
  await settle();
  assert.equal(calls[0].url, PIXELEYE_SHEET_URLS.sanathnagar);

  // Sheet down: lead stays saved, marked failed for the retry scheduler.
  calls.length = 0; googleMode = "fail"; console.error = () => {};
  const failing = await make({ service: "Retina" });
  await settle(); console.error = origError;
  const failed = await db.PixelEyeWebsiteLead.findByPk(failing.id);
  assert.equal(failed.sheet_sync_status, "failed");
  assert.equal(failed.sheet_sync_attempts, 1);
  assert.ok(failed.sheet_sync_next_attempt_at);

  // No recognisable landing page: saved, nothing mirrored.
  calls.length = 0; googleMode = "ok";
  const unknown = await make({ service: "Retina Other" });
  await settle();
  assert.equal(calls.length, 0);
  assert.equal((await db.PixelEyeWebsiteLead.findByPk(unknown.id)).sheet_sync_status, "skipped");

  // Admin-created lead is never mirrored.
  const admin = await svc.createPixelEyeWebsiteLead(
    { name: `Admin ${suffix}`, mobile_number: `97${suffix}01`, service: "Cataract" },
    { getScope: (filters) => filters, id: client.id, isSuperAdmin: true },
    undefined,
  ).catch(() => null);
  if (admin) { ids.push(admin.id); assert.equal(admin.sheet_sync_status, "skipped"); }

  console.log("PixelEye sheet-sync integration checks passed.");
} catch (error) {
  console.error = origError;
  console.error("PixelEye sheet-sync check FAILED:", error);
  process.exitCode = 1;
} finally {
  console.error = origError;
  globalThis.fetch = realFetch;
  if (ids.length) await db.PixelEyeWebsiteLead.destroy({ where: { id: ids } });
  process.exit(process.exitCode || 0);
}
