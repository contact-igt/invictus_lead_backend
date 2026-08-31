/**
 * One-time backfill: canonicalize existing city / state values on the
 * Invictus enquiry + careers tables so the filter-option queries return
 * clean, de-duplicated lists — and populate `state` for rows that never had
 * one, using the deterministic city→state map (NO Geoapify calls).
 *
 * Usage:  node src/scripts/backfillInvictusLocations.js
 *         node src/scripts/backfillInvictusLocations.js --dry-run
 */
import dotenv from "dotenv";
import db from "../database/index.js";
import { normalizeLocationValue, isValidLocationValue } from "../utils/locationText.js";
import { resolveLocationOffline } from "../services/locationResolver.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * @param {string} label
 * @param {import("sequelize").Model} model
 * @param {string} cityField  physical city column name
 */
const backfillTable = async (label, model, cityField) => {
  const tracksVerification = Object.prototype.hasOwnProperty.call(model.rawAttributes, "location_verified");
  const rows = await model.findAll({
    attributes: ["id", cityField, "state", ...(tracksVerification ? ["location_verified"] : [])],
    raw: true,
  });

  let cityUpdated = 0;
  let stateUpdated = 0;
  let stateFilled = 0;
  let stateCleared = 0;
  let verificationUpdated = 0;
  const unresolvedCities = new Set();

  for (const row of rows) {
    const patch = {};
    const rawCity = row[cityField];
    const rawState = row.state;

    // Deterministic resolution: normalize + alias + comma parse + city→state map.
    const off = resolveLocationOffline(rawCity);

    if (off.city && off.city !== rawCity) {
      patch[cityField] = off.city;
      cityUpdated += 1;
    } else if (!off.city && rawCity) {
      unresolvedCities.add(String(rawCity)); // NOT NULL column — needs a human
    }

    const hasState = rawState != null && String(rawState).trim() !== "";
    if (hasState) {
      if (isValidLocationValue(rawState)) {
        const normState = normalizeLocationValue(rawState);
        if (normState !== rawState) {
          patch.state = normState;
          stateUpdated += 1;
        }
      } else {
        patch.state = off.state || null;
        if (off.state) stateFilled += 1;
        else stateCleared += 1;
      }
    } else if (off.state) {
      patch.state = off.state; // was NULL, inferred from the city
      stateFilled += 1;
    }

    // Offline backfill may upgrade known cities, but must never downgrade a
    // city that was already verified by Geoapify.
    if (tracksVerification && off.verified && !row.location_verified) {
      patch.location_verified = true;
      verificationUpdated += 1;
    }

    if (Object.keys(patch).length && !DRY_RUN) {
      await model.update(patch, { where: { id: row.id } });
    }
  }

  console.log(
    `[${label}] rows=${rows.length} cityUpdated=${cityUpdated} ` +
      `stateNormalized=${stateUpdated} stateInferred=${stateFilled} stateCleared=${stateCleared}` +
      (tracksVerification ? ` locationVerificationUpdated=${verificationUpdated}` : "") +
      (DRY_RUN ? "  (dry-run, nothing written)" : ""),
  );
  if (unresolvedCities.size) {
    console.log(`[${label}] cities needing manual review: ${[...unresolvedCities].join(", ")}`);
  }
};

const run = async () => {
  await db.sequelize.authenticate();
  await backfillTable("careers", db.InvictusCareersApplication, "current_city");
  await backfillTable("general", db.InvictusGeneralEnquiry, "city");
  console.log("Location backfill complete.");
};

run()
  .catch((error) => {
    console.error("[ERROR] Location backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
