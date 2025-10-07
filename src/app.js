import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import ServerEnvironmentConfig from "./config/server.config.js";
import db from "./database/index.js";
import VlsLawPracticeRouter from "./models/VlsLawPrcticeModels/vlslawpractice.routes.js";
import ManagementRouter from "./models/ManagementModels/management.routes.js";
import VlsLawAcademyRouter from "./models/VlsLawAcademyModels/vlslawacademy.routes.js";
import PixelEyeRouter from "./models/PixelEyeModels/pixeleye.routes.js"
import RamananFinancialRouter from "./models/RamananFinancialModels/ramananfinancial.routes.js"

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

app.use("/api/v1", VlsLawPracticeRouter, ManagementRouter, VlsLawAcademyRouter , PixelEyeRouter , RamananFinancialRouter );

app.listen(
  ServerEnvironmentConfig?.server?.line == "production"
    ? ServerEnvironmentConfig?.server?.live
    : ServerEnvironmentConfig?.server?.local,
  () => {
    console.log(
      `server connected ${
        ServerEnvironmentConfig?.server?.line == "production"
          ? ServerEnvironmentConfig?.server?.live
          : ServerEnvironmentConfig?.server?.local
      }`
    );
    console.log(
      `Swagger docs available at http://localhost:${
        ServerEnvironmentConfig?.server?.line == "production"
          ? ServerEnvironmentConfig?.server?.live
          : ServerEnvironmentConfig?.server?.local
      }/api-docs`
    );
  }
);
