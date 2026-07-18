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
import PixelEyeWebsiteLeadRouter from "./modules/pixelEyeWebsiteLeads/pixelEyeWebsiteLead.routes.js";
import PixelEyeWebhookRouter from "./modules/pixelEye/webhook/pixelEyeWebhook.routes.js";
import { startPixelEyeScheduler } from "./modules/pixelEye/pixelEyeScheduler.js";
import { startPixelEyeFollowUpComplianceScheduler } from "./modules/pixelEye/pixelEyeFollowUpComplianceScheduler.js";
import PropertyLawRouter from "./modules/vls/propertyLaw/propertyLaw.routes.js";
import FamilyLawRouter from "./modules/vls/familyLaw/familyLaw.routes.js";
import VlsAibeRouter from "./modules/vls/vlsAibe/vlsAibe.routes.js";
import AaravEyeCareRouter from "./modules/aaravEyeCare/aaravEyeCare.routes.js";
import AntardrashtiNetralayaRouter from "./modules/antardrashtiNetralaya/antardrashtiNetralaya.routes.js";
import RioRouter from "./modules/rio/rio.routes.js";
import VlsMactMasterClassRouter from "./modules/vlsMactMasterClass/vlsMactMasterClass.routes.js";
import { ensurePixelEyeLeadStateCurrentDayColumn } from "./database/migrations/ensurePixelEyeLeadStateCurrentDay.js";
import { ensurePixelEyeLeadStateLeadIdColumn } from "./database/migrations/ensurePixelEyeLeadStateLeadId.js";
import { ensurePixelEyeLeadStateCompletionSourceColumn } from "./database/migrations/ensurePixelEyeLeadStateCompletionSource.js";
import { ensurePixelEyeLeadStateScheduleTypes } from "./database/migrations/ensurePixelEyeLeadStateScheduleTypeManual.js";
import { ensurePixelEyeStatusEnums } from "./database/migrations/ensurePixelEyeDnpStatusEnums.js";
import { ensurePixelEyeFollowUpHistoryTable } from "./database/migrations/ensurePixelEyeFollowUpHistoryTable.js";
import { ensurePixelEyeCallLogTable } from "./database/migrations/ensurePixelEyeCallLogTable.js";
import { ensurePixelEyeFollowUpCallComplianceTable } from "./database/migrations/ensurePixelEyeFollowUpCallComplianceTable.js";
import { ensurePixelEyePhoneNormalization } from "./database/migrations/ensurePixelEyePhoneNormalization.js";
import ensureAddFollowUpHistoryMetadataColumn from "./database/migrations/ensureAddFollowUpHistoryMetadataColumn.js";
import { ensurePixelEyeLeadNotesColumn } from "./database/migrations/ensurePixelEyeLeadNotesColumn.js";

import ShantiEyeTechRouter from './modules/shantiEyeTech/shantiEyeTech.routes.js';
import PhoenixFitnessRouter from './modules/phoenixFitness/phoenixFitness.routes.js';

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
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply the API rate limiter
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
    await ensurePixelEyeLeadStateLeadIdColumn();
    await ensurePixelEyeLeadStateCompletionSourceColumn();
    await ensurePixelEyeLeadStateScheduleTypes();
    await ensurePixelEyeStatusEnums();
    await ensurePixelEyeFollowUpHistoryTable();
    await ensurePixelEyeCallLogTable();
    await ensurePixelEyeFollowUpCallComplianceTable();
    await ensurePixelEyePhoneNormalization();
    await ensurePixelEyeLeadNotesColumn();
    await ensureAddFollowUpHistoryMetadataColumn();
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
app.use("/api/v1/pixeleye/website-leads", PixelEyeWebsiteLeadRouter);
app.use("/api/v1/pixeleye", PixelEyeRouter);
app.use("/api/v1/property-law", PropertyLawRouter);
app.use("/api/v1/family-law", FamilyLawRouter);
app.use("/api/v1/vls-aibe", VlsAibeRouter);
app.use("/api/v1/vls-mact-master-class", VlsMactMasterClassRouter);
app.use("/api/v1/aarav-eye-care", AaravEyeCareRouter);
app.use("/api/v1/antardrashti-netralaya", AntardrashtiNetralayaRouter);
app.use("/api/v1/rio", RioRouter);

app.use('/api/v1/shanti-eye-tech', ShantiEyeTechRouter);
app.use('/api/v1/phoenix-fitness', PhoenixFitnessRouter);

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

  const status = Number.isInteger(err.status) ? err.status : 500;
  const message =
    status >= 400 && status < 500 && err.message
      ? err.message
      : "Internal Server Error";

  res.status(status).json({ message });
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







