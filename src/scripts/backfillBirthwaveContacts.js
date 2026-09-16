import db from "../database/index.js";
import { Op } from "sequelize";
import {
  normalizeBirthwaveEmail,
  normalizeBirthwavePhone,
  resolveOrCreateBirthwaveContact,
} from "../modules/birthwave/birthwaveContact.service.js";
import { logBirthwaveActivity } from "../modules/birthwave/birthwaveActivity.service.js";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 100;
const serverLine = process.env.INVICTUS_SERVER_LINE || "local";

if (APPLY && !["local", "development"].includes(serverLine) && process.env.ALLOW_BIRTHWAVE_CONTACT_BACKFILL !== "true") {
  throw new Error("Refusing Contact backfill outside local/development without ALLOW_BIRTHWAVE_CONTACT_BACKFILL=true");
}

const counters = {
  leads_scanned: 0,
  leads_linked: 0,
  leads_unresolved: 0,
  website_scanned: 0,
  website_linked: 0,
  conflicts: 0,
  errors: 0,
};

const identityAvailable = (row) => Boolean(normalizeBirthwavePhone(row.phone) || normalizeBirthwaveEmail(row.email));

const backfillModel = async (Model, kind) => {
  let rows;
  let lastId = 0;
  do {
    rows = await Model.findAll({
      where: { contact_id: null, id: { [Op.gt]: lastId } },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });
    for (const row of rows) {
      lastId = row.id;
      counters[kind === "lead" ? "leads_scanned" : "website_scanned"] += 1;
      if (!identityAvailable(row)) {
        counters[kind === "lead" ? "leads_unresolved" : "leads_unresolved"] += 1;
        continue;
      }
      if (!APPLY) continue;
      try {
        await db.sequelize.transaction(async (transaction) => {
          const resolved = await resolveOrCreateBirthwaveContact({
            clientId: row.client_id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            transaction,
          });
          await row.update({ contact_id: resolved.contact.id }, { transaction });
          if (kind === "lead") {
            await logBirthwaveActivity({
              clientId: row.client_id,
              leadId: row.id,
              eventType: "contact_resolved",
              title: "Contact linked during backfill",
              description: `Contact ${resolved.contact.id} resolved by ${resolved.matchMethod}`,
              transaction,
            });
          }
          if (kind === "lead") counters.leads_linked += 1;
          else counters.website_linked += 1;
        });
      } catch (error) {
        if (error?.code === "CONTACT_IDENTITY_CONFLICT") counters.conflicts += 1;
        else counters.errors += 1;
        console.error(JSON.stringify({ event: "birthwave_contact_backfill_error", kind, id: row.id, message: error.message }));
      }
    }
  } while (APPLY && rows.length === BATCH_SIZE);
};

const main = async () => {
  // A dry run is intentionally read-only and reports unresolved identities;
  // --apply performs one short transaction per row and is rerunnable.
  if (!APPLY) {
    const [leadCount, websiteCount] = await Promise.all([
      db.BirthwaveLead.count({ where: { contact_id: null } }),
      db.BirthwaveWebsiteLead.count({ where: { contact_id: null } }),
    ]);
    console.log(JSON.stringify({ mode: "dry-run", lead_candidates: leadCount, website_candidates: websiteCount, batch_size: BATCH_SIZE }, null, 2));
    return;
  }
  await backfillModel(db.BirthwaveLead, "lead");
  await backfillModel(db.BirthwaveWebsiteLead, "website");
  console.log(JSON.stringify({ mode: "apply", ...counters, batch_size: BATCH_SIZE }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
