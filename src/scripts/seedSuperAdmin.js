import dotenv from "dotenv";
import bcrypt from "bcrypt";
import db from "../database/index.js";
import { loginService } from "../modules/auth/auth.service.js";

dotenv.config();

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return String(value).trim();
};

const seedSuperAdmin = async () => {
  console.log("Starting super admin seeding...");

  const superAdminData = {
    title: requireEnv("SEED_SUPER_ADMIN_TITLE"),
    username: requireEnv("SEED_SUPER_ADMIN_USERNAME"),
    email: requireEnv("SEED_SUPER_ADMIN_EMAIL"),
    mobile: requireEnv("SEED_SUPER_ADMIN_MOBILE"),
    password: requireEnv("SEED_SUPER_ADMIN_PASSWORD"),
    country_code: requireEnv("SEED_SUPER_ADMIN_COUNTRY_CODE").replace("+", ""),
    role: "super-admin",
  };

  // Ensure database is synced
  await db.sequelize.sync();

  // Check if super admin already exists
  const existingUser = await loginService(superAdminData.email);
  if (existingUser) {
    console.log(
      `[SKIPPED] Super admin already exists for email: ${superAdminData.email}`,
    );
    return;
  }

  // Create super admin directly since users module is not present.
  const hashedPassword = await bcrypt.hash(superAdminData.password, 10);
  await db.Management.create({
    title: superAdminData.title,
    username: superAdminData.username,
    email: superAdminData.email,
    mobile: superAdminData.mobile,
    country_code: superAdminData.country_code,
    password: hashedPassword,
    role: superAdminData.role,
  });

  console.log(`[SUCCESS] Super admin created: ${superAdminData.email}`);
};

seedSuperAdmin()
  .catch((error) => {
    console.error("[ERROR] Failed to seed super admin:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
