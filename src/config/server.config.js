import { requireEnv } from "./env.config.js";

const serverLine = requireEnv("INVICTUS_SERVER_LINE");
const supportedServerLines = ["production", "development", "local"];

if (!supportedServerLines.includes(serverLine)) {
  throw new Error(
    `Invalid INVICTUS_SERVER_LINE: expected one of ${supportedServerLines.join(", ")}`,
  );
}

const serverPortEnvName = {
  production: "INVICTUS_SERVER_START_LIVE",
  development: "INVICTUS_SERVER_START_DEVELOPMENT",
  local: "INVICTUS_SERVER_START_LOCAL",
}[serverLine];

requireEnv(serverPortEnvName);

const ServerEnvironmentConfig = {
  jwt_key: requireEnv("JWT_SECRET_KEY"),
  server: {
    line: serverLine,
    live: process.env.INVICTUS_SERVER_START_LIVE,
    development: process.env.INVICTUS_SERVER_START_DEVELOPMENT,
    local: process.env.INVICTUS_SERVER_START_LOCAL,
    ngrokPublicUrl: process.env.INVICTUS_NGROK_PUBLIC_URL || "",
    pixelEyeWebhookPublicUrl: process.env.PIXELEYE_WEBHOOK_PUBLIC_URL || "",
  },
};

export default ServerEnvironmentConfig;
