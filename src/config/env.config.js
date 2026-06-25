import dotenv from "dotenv";

dotenv.config();

export const requireEnv = (name, { allowEmpty = false } = {}) => {
  const value = process.env[name];

  if (value === undefined || (!allowEmpty && !value.trim())) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};