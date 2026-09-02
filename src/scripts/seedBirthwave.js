import dotenv from "dotenv";
import db from "../database/index.js";

dotenv.config();

const CLIENT_KEY = "birthwave";
const CLIENT_NAME = "Birthwave Women Wellness Hospital";

const SAMPLE_DOCTORS = [
  { name: "Dr. Meera Krishnan", specialty: "Obstetrics & Gynaecology" },
  { name: "Dr. Anitha Rao", specialty: "Fetal Medicine" },
  { name: "Dr. Priya Nair", specialty: "Fertility & IVF" },
];

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
