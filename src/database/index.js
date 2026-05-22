import Sequelize from "sequelize";
import DatabaseEnvironmentConfig from "../config/database.config.js";
import ServerEnvironmentConfig from "../config/server.config.js";
import { clientTable } from "./tables/ClientTable/index.js";
import { vlslawpracticeTable } from "./tables/VlsLawPracticeTable/index.js";
import { managementTable } from "./tables/ManagementTable/index.js";
import { vlsLawAcademyTable } from "./tables/VlsLawAcademyTable/index.js";
import { vlslawaibeTable } from "./tables/VlsLawAibeTable/index.js";
import { vlsPropertyLawTable } from "./tables/VlsPropertyLawTable/index.js";
import { PixelEyeTable } from "./tables/PixelEyeTable/index.js";
import { PixelEyeLeadStateTable } from "./tables/PixelEyeLeadStateTable/index.js";

const dbconfig =
  ServerEnvironmentConfig?.server?.line === "production"
    ? DatabaseEnvironmentConfig?.live
    : ServerEnvironmentConfig?.server?.line === "development"
      ? DatabaseEnvironmentConfig?.development
      : DatabaseEnvironmentConfig?.local;

const sequelize = new Sequelize(
  dbconfig?.database,
  dbconfig?.user,
  dbconfig?.password,
  {
    host: dbconfig?.host,
    dialect: "mysql",
    timezone: "+05:30",
    logging: false,
  },
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.Client = clientTable(Sequelize, sequelize);
db.VlsLawPractice = vlslawpracticeTable(Sequelize, sequelize);
db.Management = managementTable(Sequelize, sequelize);
db.VlsLawAcademy = vlsLawAcademyTable(Sequelize, sequelize);
db.VlsLawAibe = vlslawaibeTable(Sequelize, sequelize);
db.PixelEye          = PixelEyeTable(Sequelize, sequelize);
db.PixelEyeLeadState = PixelEyeLeadStateTable(Sequelize, sequelize);
db.VlsPropertyLaw = vlsPropertyLawTable(Sequelize, sequelize);
db.PixelEye = PixelEyeTable(Sequelize, sequelize);

const addClientId = (model) => {
  model.belongsTo(db.Client, { foreignKey: "client_id", as: "client" });
  db.Client.hasMany(model, { foreignKey: "client_id" });
};

addClientId(db.Management);
addClientId(db.VlsLawPractice);
addClientId(db.VlsLawAcademy);
addClientId(db.VlsLawAibe);
addClientId(db.VlsPropertyLaw);
addClientId(db.PixelEye);
addClientId(db.PixelEyeLeadState);

export default db;
