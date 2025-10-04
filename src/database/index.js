import Sequelize from "sequelize";
import DatabaseEnvironmentConfig from "../config/database.config.js";
import ServerEnvironmentConfig from "../config/server.config.js";
import { vlslawpracticeTable } from "./tables/VlsLawPracticeTable/index.js";
import { managementTable } from "./tables/ManagementTable/index.js";
import { vlsLawAcademyTable } from "./tables/VlsLawAcademyTable/index.js";
import { ramananFinancialTable } from "./tables/RamananFinancialTable/index.js";
import { pixelEyeTable } from "./tables/PixelEyeTable/index.js";

const dbconfig =
  ServerEnvironmentConfig?.server?.line === "production"
    ? DatabaseEnvironmentConfig?.live
    : DatabaseEnvironmentConfig?.local;

const sequelize = new Sequelize(
  dbconfig?.databse,
  dbconfig?.user,
  dbconfig?.password,
  {
    host: dbconfig?.host,
    dialect: "mysql",
    timezone: "+00:00",
    // logging: false,
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.VlsLawPractice = vlslawpracticeTable(Sequelize, sequelize);
db.Management = managementTable(Sequelize, sequelize);
db.VlsLawAcademy = vlsLawAcademyTable(Sequelize, sequelize);
db.Ramananfinancial = ramananFinancialTable(Sequelize, sequelize);
db.PixelEye = pixelEyeTable(Sequelize, sequelize);

export default db;



