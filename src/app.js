import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import ServerEnvironmentConfig from "./config/server.config.js";
import db from "./database/index.js";
import AuthRouter from "./modules/auth/auth.routes.js";
import UsersRouter from "./modules/users/users.routes.js";
import ClientRouter from "./modules/client/client.routes.js";
import DynamicRouter from "./modules/dynamic/dynamic.routes.js";
import PixelEyeRouter from "./modules/pixelEye/pixelEye.routes.js";
import PixelEyeWebhookRouter from "./modules/pixelEye/webhook/pixelEyeWebhook.routes.js";
import { startPixelEyeScheduler } from "./modules/pixelEye/pixelEyeScheduler.js";
import { startPixelEyeFollowUpComplianceScheduler } from "./modules/pixelEye/pixelEyeFollowUpComplianceScheduler.js";
import PropertyLawRouter from "./modules/vls/propertyLaw/propertyLaw.routes.js";
import VlsAibeRouter from "./modules/vls/vlsAibe/vlsAibe.routes.js";
import { ensurePixelEyeLeadStateCurrentDayColumn } from "./database/migrations/ensurePixelEyeLeadStateCurrentDay.js";
import { ensurePixelEyeLeadStateManualScheduleType } from "./database/migrations/ensurePixelEyeLeadStateScheduleTypeManual.js";
import { ensurePixelEyeDnpStatusEnums } from "./database/migrations/ensurePixelEyeDnpStatusEnums.js";
import { ensurePixelEyeFollowUpHistoryTable } from "./database/migrations/ensurePixelEyeFollowUpHistoryTable.js";
import { ensurePixelEyeCallLogTable } from "./database/migrations/ensurePixelEyeCallLogTable.js";
import { ensurePixelEyeFollowUpCallComplianceTable } from "./database/migrations/ensurePixelEyeFollowUpCallComplianceTable.js";

const app = express();

// Set security HTTP headers
app.use(helmet());
app.set("trust proxy", 1);

// API clients expect fresh JSON data; avoid conditional cache 304 responses.
app.disable("etag");

// const whitelist = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:4000")
//   .split(",")
//   .map((origin) => origin.trim())
//   .filter(Boolean);

const corsOptions = {
  origin: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login requests per windowMs
  message:
    "Too many login attempts from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply the rate limiters
app.use("/api/v1/auth/login", loginLimiter);
app.use("/api/v1/", (req, res, next) => {
  if (req.path.startsWith("/pixeleye/webhook")) return next();
  return apiLimiter(req, res, next);
});

app.use("/api/v1", (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

const connect_mysql = async () => {
  try {
    await db.sequelize.sync();
    await ensurePixelEyeLeadStateCurrentDayColumn();
    await ensurePixelEyeLeadStateManualScheduleType();
    await ensurePixelEyeDnpStatusEnums();
    await ensurePixelEyeFollowUpHistoryTable();
    await ensurePixelEyeCallLogTable();
    await ensurePixelEyeFollowUpCallComplianceTable();
    console.log("Database synchronized for Multi-Tenant architecture");
    startPixelEyeScheduler();
    startPixelEyeFollowUpComplianceScheduler();
  } catch (error) {
    console.error("Failed to synchronize database:", error);
    process.exit(1);
  }
};

// Routes
app.use("/api/v1/auth", AuthRouter);
app.use("/api/v1/users", UsersRouter);
app.use("/api/v1/dynamic", DynamicRouter);
app.use("/api/v1/clients", ClientRouter);
app.use("/api/v1/pixeleye", PixelEyeWebhookRouter);
app.use("/api/v1/pixeleye", PixelEyeRouter);
app.use("/api/v1/property-law", PropertyLawRouter);
app.use("/api/v1/vls-aibe", VlsAibeRouter);

// Base route
app.get("/", (req, res) => {
  res.json({ message: "Invictus SaaS API v1.0 - Multi-Tenant" });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.stack : {},
  });
});

const { line, live, development, local } =
  ServerEnvironmentConfig?.server ?? {};

const rawPort =
  line === "production" ? live : line === "development" ? development : local;

const PORT = parseInt(rawPort, 10) || 8000;

await connect_mysql();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${line ?? "local"} mode]`);
});
