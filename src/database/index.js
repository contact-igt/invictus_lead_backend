import Sequelize from "sequelize";
import DatabaseEnvironmentConfig from "../config/database.config.js";
import ServerEnvironmentConfig from "../config/server.config.js";
import { clientTable } from "./tables/ClientTable/index.js";
import { vlslawpracticeTable } from "./tables/VlsLawPracticeTable/index.js";
import { managementTable } from "./tables/ManagementTable/index.js";
import { vlsLawAcademyTable } from "./tables/VlsLawAcademyTable/index.js";
import { vlslawaibeTable } from "./tables/VlsLawAibeTable/index.js";
import { vlsPropertyLawTable } from "./tables/VlsPropertyLawTable/index.js";
import { vlsFamilyLawTable } from "./tables/VlsFamilyLawTable/index.js";
import { PixelEyeTable } from "./tables/PixelEyeTable/index.js";
import { PixelEyeLeadStateTable } from "./tables/PixelEyeLeadStateTable/index.js";
import { PixelEyeFollowUpHistoryTable } from "./tables/PixelEyeFollowUpHistoryTable/index.js";
import { PixelEyeCallLogTable } from "./tables/PixelEyeCallLogTable/index.js";
import { PixelEyeFollowUpCallComplianceTable } from "./tables/PixelEyeFollowUpCallComplianceTable/index.js";
import { PixelEyeWebsiteLeadTable } from "./tables/PixelEyeWebsiteLeadTable/index.js";
import { AaravEyeCareTable } from "./tables/AaravEyeCareTable/index.js";
import { AntardrashtiNetralayaTable } from "./tables/AntardrashtiNetralayaTable/index.js";
import { RioTable } from "./tables/RioTable/index.js";
import { VlsMactMasterClassTable } from "./tables/VlsMactMasterClassTable/index.js";

import { ShantiEyeTechTable } from './tables/ShantiEyeTechTable/index.js';
import { PhoenixFitnessTable } from './tables/PhoenixFitnessTable/index.js';
import { DATABASE_TIME_ZONE_OFFSET } from "../config/timezone.config.js";

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
    timezone: DATABASE_TIME_ZONE_OFFSET,
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
db.PixelEyeFollowUpHistory = PixelEyeFollowUpHistoryTable(Sequelize, sequelize);
db.PixelEyeCallLog = PixelEyeCallLogTable(Sequelize, sequelize);
db.PixelEyeFollowUpCallCompliance = PixelEyeFollowUpCallComplianceTable(Sequelize, sequelize);
db.PixelEyeWebsiteLead = PixelEyeWebsiteLeadTable(Sequelize, sequelize);
db.AaravEyeCare = AaravEyeCareTable(Sequelize, sequelize);
db.AntardrashtiNetralaya = AntardrashtiNetralayaTable(Sequelize, sequelize);
db.Rio = RioTable(Sequelize, sequelize);
db.VlsPropertyLaw = vlsPropertyLawTable(Sequelize, sequelize);
db.VlsFamilyLaw = vlsFamilyLawTable(Sequelize, sequelize);
db.VlsMactMasterClass = VlsMactMasterClassTable(Sequelize, sequelize);
db.ShantiEyeTech = ShantiEyeTechTable(Sequelize, sequelize);
db.PhoenixFitness = PhoenixFitnessTable(Sequelize, sequelize);

const addClientId = (model) => {
  model.belongsTo(db.Client, { foreignKey: "client_id", as: "client" });
  db.Client.hasMany(model, { foreignKey: "client_id" });
};



addClientId(db.Management);
addClientId(db.VlsLawPractice);
addClientId(db.VlsLawAcademy);
addClientId(db.VlsLawAibe);
addClientId(db.VlsPropertyLaw);
addClientId(db.VlsFamilyLaw);
addClientId(db.VlsMactMasterClass);
addClientId(db.PixelEye);
addClientId(db.PixelEyeLeadState);
addClientId(db.AaravEyeCare);
addClientId(db.AntardrashtiNetralaya);
addClientId(db.Rio);
addClientId(db.PixelEyeWebsiteLead);

addClientId(db.ShantiEyeTech);
addClientId(db.PhoenixFitness);

export default db;






