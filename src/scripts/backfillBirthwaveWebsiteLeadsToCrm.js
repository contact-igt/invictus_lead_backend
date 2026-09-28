// One-off: link legacy birthwave_website_leads rows (created before the site
// posted to the backend directly) to CRM leads via promoteWebsiteLead().
// Idempotent; local/development DBs only. Dry run unless --apply is passed.
import db from "../database/index.js";
import { promoteWebsiteLead } from "../modules/birthwave/birthwaveWebsiteLead.service.js";

if (!["local", "development"].includes(process.env.INVICTUS_SERVER_LINE || "local")) {
  throw new Error("Backfill is restricted to local/development databases");
}

const apply = process.argv.includes("--apply");
const rows = await db.BirthwaveWebsiteLead.findAll({ where: { birthwave_lead_id: null }, order: [["id", "ASC"]] });
console.log(`${rows.length} website enquiries without a CRM lead${apply ? "" : " (dry run — pass --apply)"}`);

let created = 0;
for (const row of rows) {
  if (!apply) { console.log(`  would promote #${row.id} ${row.source_key} ${row.name}`); continue; }
  const result = await promoteWebsiteLead(row.client_id, row.id, { id: null, role: "super-admin", name: "Backfill" });
  if (result.created) created += 1;
}
if (apply) console.log(`Created ${created} CRM leads.`);
process.exit(0);
