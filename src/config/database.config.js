import { requireEnv } from "./env.config.js";
import ServerEnvironmentConfig from "./server.config.js";

const databaseEnvNames = {
  production: {
    host: "DATABASE_PRO_HOST",
    user: "DATABASE_PRO_USER",
    password: "DATABASE_PRO_PASSWORD",
    database: "DATABASE_PRO_DB",
  },
  development: {
    host: "DATABASE_DEV_HOST",
    user: "DATABASE_DEV_USER",
    password: "DATABASE_DEV_PASSWORD",
    database: "DATABASE_DEV_DB",
  },
  local: {
    host: "DATABASE_HOST",
    user: "DATABASE_USER",
    password: "DATABASE_PASSWORD",
    database: "DATABASE_DB",
  },
};

const activeDatabaseEnvNames =
  databaseEnvNames[ServerEnvironmentConfig.server.line];

Object.entries(activeDatabaseEnvNames).forEach(([field, envName]) => {
  requireEnv(envName, {
    allowEmpty:
      ServerEnvironmentConfig.server.line === "local" && field === "password",
  });
});

const DatabaseEnvironmentConfig = {
  live: {
    host: process.env.DATABASE_PRO_HOST,
    user: process.env.DATABASE_PRO_USER,
    password: process.env.DATABASE_PRO_PASSWORD,
    database: process.env.DATABASE_PRO_DB,
  },

  development: {
    host: process.env.DATABASE_DEV_HOST,
    user: process.env.DATABASE_DEV_USER,
    password: process.env.DATABASE_DEV_PASSWORD,
    database: process.env.DATABASE_DEV_DB,
  },

  local: {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_DB,
  },
};

export default DatabaseEnvironmentConfig;