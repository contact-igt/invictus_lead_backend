import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import ServerEnvironmentConfig from "./config/server.config.js";
import db from "./database/index.js";
import VlsLawPracticeRouter from "./models/VlsLawPrcticeModels/vlslawpractice.routes.js";
import ManagementRouter from "./models/ManagementModels/management.routes.js";
import VlsLawAcademyRouter from "./models/VlsLawAcademyModels/vlslawacademy.routes.js";
import PixelEyeRouter from "./models/PixelEyeModels/pixeleye.routes.js";
import RamananFinancialRouter from "./models/RamananFinancialModels/ramananfinancial.routes.js";
import KrinstituteRouter from "./models/KrinstituteModels/krinstitute.routes.js";
import WellinitRouter from "./models/WellinitModels/wellinit.routes.js";
import NaitrikaRouter from "./models/NaitrikaModels/naitrika.routes.js";
import NetralyaRouter from "./models/NetralyaModels/netralaya.routes.js";
import MahimmyfoodsRouter from "./models/MahimmyfoodsModels/mahimmyfoods.routes.js";
import InvictusRouter from "./models/InvictusModels/invictus.routes.js";
import InvictusMetaRouter from "./models/InvictusMetaModels/invictusmeta.routes.js";
import MirraBuilderRouter from "./models/MirraBuilderModels/mirrabuiler.routes.js";
import VlsLawAibeRouter from "./models/VlsLawAibeModels/vlslawaibe.routes.js"


const app = express();
const corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Hello API Working Fine",
  });
});

const connect_mysql = async () => {
  await db.sequelize.sync();
  console.log("db connect");
};

connect_mysql();

app.use(
  "/api/v1",
  VlsLawPracticeRouter,
  ManagementRouter,
  VlsLawAcademyRouter,
  PixelEyeRouter,
  RamananFinancialRouter,
  KrinstituteRouter,
  WellinitRouter,
  NaitrikaRouter,
  NetralyaRouter,
  MahimmyfoodsRouter,
  InvictusRouter,
  InvictusMetaRouter,
  MirraBuilderRouter,
  VlsLawAibeRouter
);

app.listen(
  ServerEnvironmentConfig?.server?.line == "production"
    ? ServerEnvironmentConfig?.server?.live
    : ServerEnvironmentConfig?.server?.line == "development"
    ? ServerEnvironmentConfig?.server?.development
    : ServerEnvironmentConfig?.server?.local,
  () => {
    console.log(
      `server connected ${
        ServerEnvironmentConfig?.server?.line == "production"
          ? ServerEnvironmentConfig?.server?.live
          : ServerEnvironmentConfig?.server?.line == "development"
          ? ServerEnvironmentConfig?.server?.development
          : ServerEnvironmentConfig?.server?.local
      }`
    );
  }
);


