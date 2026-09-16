import dotenv from "dotenv";
import db from "../database/index.js";
import { BIRTHWAVE_SEED_SERVICES } from "../database/migrations/20260910_birthwave_services_master.js";

dotenv.config();

const CLIENT_KEY = "birthwave";
const CLIENT_NAME = "Birthwave Women Wellness Hospital";

const SAMPLE_DOCTORS = [
  { name: "Dr. Meera Krishnan", specialty: "Obstetrics & Gynaecology" },
  { name: "Dr. Anitha Rao", specialty: "Fetal Medicine" },
  { name: "Dr. Priya Nair", specialty: "Fertility & IVF" },
];

/**
 * BW-SVC-003: seeds the approved Birthwave service master for one tenant.
 * Shares BIRTHWAVE_SEED_SERVICES with the migration so the list cannot drift
 * between "migrated tenant" and "newly bootstrapped tenant".
 */
const seedServicesForClient = async (clientId) => {
  const existing = await db.BirthwaveService.findAll({
    where: { client_id: clientId },
    attributes: ["slug"],
  });
  const present = new Set(existing.map((row) => row.slug));
  const missing = BIRTHWAVE_SEED_SERVICES
    .map((service, index) => ({ ...service, sort_order: (index + 1) * 10 }))
    .filter((service) => !present.has(service.slug));

  if (!missing.length) {
    console.log(`[SKIPPED] ${present.size} service(s) already present`);
    return;
  }

  await db.BirthwaveService.bulkCreate(
    missing.map((service) => ({
      client_id: clientId,
      name: service.name,
      slug: service.slug,
      is_active: true,
      sort_order: service.sort_order,
      is_system: Boolean(service.is_system),
    })),
  );
  console.log(`[SUCCESS] Seeded ${missing.length} service(s)`);
};

const seedBirthwave = async () => {
  console.log("Starting Birthwave seeding...");

  await db.sequelize.sync();

  const [client, createdClient] = await db.Client.findOrCreate({
    where: { client_key: CLIENT_KEY },
    defaults: { client_key: CLIENT_KEY, name: CLIENT_NAME },
  });
  console.log(
    createdClient
      ? `[SUCCESS] Client created: ${CLIENT_KEY} (id ${client.id})`
      : `[SKIPPED] Client already exists: ${CLIENT_KEY} (id ${client.id})`,
  );

  // BW-SVC-003: the service master is seeded per tenant by
  // 20260910_birthwave_services_master, but that migration only ever runs once —
  // a Birthwave client created afterwards (which is exactly what this script
  // does) would otherwise start with ZERO services, leaving the website form,
  // Add Lead and Assignment Rules with nothing to offer. Tenant bootstrap seeds
  // them too. Idempotent: only missing slugs are inserted.
  await seedServicesForClient(client.id);

  const existingDoctors = await db.BirthwaveDoctor.count({
    where: { client_id: client.id },
  });
  if (existingDoctors > 0) {
    console.log(`[SKIPPED] ${existingDoctors} doctor(s) already present`);
    return;
  }

  await db.BirthwaveDoctor.bulkCreate(
    SAMPLE_DOCTORS.map((doctor) => ({ ...doctor, client_id: client.id, active: true })),
  );
  console.log(`[SUCCESS] Seeded ${SAMPLE_DOCTORS.length} sample doctors`);
};

seedBirthwave()
  .catch((error) => {
    console.error("[ERROR] Failed to seed Birthwave:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
