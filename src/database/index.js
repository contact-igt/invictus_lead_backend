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
import { VlsConsumerProtectionLawMasterClassTable } from "./tables/VlsConsumerProtectionLawMasterClassTable/index.js";
import { vlsDopAiAssistedTable } from "./tables/VlsDopAiAssistedTable/index.js";
import { vlsAiForAdvocatesTable } from "./tables/VlsAiForAdvocatesTable/index.js";
import { VlsTaxationLawTable } from "./tables/VlsTaxationLawTable/index.js";

import { ShantiEyeTechTable } from './tables/ShantiEyeTechTable/index.js';
import { PhoenixFitnessTable } from './tables/PhoenixFitnessTable/index.js';
import { ApiLogTable } from "./tables/ApiLogTable/index.js";
import { IntegrationWebhookEventTable } from "./tables/IntegrationWebhookEventTable/index.js";
import { BirthwaveDoctorTable } from "./tables/BirthwaveDoctorTable/index.js";
import { BirthwaveLeadTable } from "./tables/BirthwaveLeadTable/index.js";
import { BirthwaveAppointmentTable } from "./tables/BirthwaveAppointmentTable/index.js";
import { BirthwaveLeadActivityTable } from "./tables/BirthwaveLeadActivityTable/index.js";
import { BirthwaveWebsiteLeadTable } from "./tables/BirthwaveWebsiteLeadTable/index.js";
import { CrmCustomFieldTable } from "./tables/CrmCustomFieldTable/index.js";
import { CrmCallTable } from "./tables/CrmCallTable/index.js";
import { CrmIntegrationTable } from "./tables/CrmIntegrationTable/index.js";
import { CrmFieldMappingTable } from "./tables/CrmFieldMappingTable/index.js";
import { InvictusGeneralEnquiryTable } from "./tables/InvictusGeneralEnquiryTable/index.js";
import { InvictusCareersApplicationTable } from "./tables/InvictusCareersApplicationTable/index.js";
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
db.VlsConsumerProtectionLawMasterClass = VlsConsumerProtectionLawMasterClassTable(Sequelize, sequelize);
db.VlsDopAiAssisted = vlsDopAiAssistedTable(Sequelize, sequelize);
db.VlsAiForAdvocates = vlsAiForAdvocatesTable(Sequelize, sequelize);
db.VlsTaxationLaw = VlsTaxationLawTable(Sequelize, sequelize);
db.ShantiEyeTech = ShantiEyeTechTable(Sequelize, sequelize);
db.PhoenixFitness = PhoenixFitnessTable(Sequelize, sequelize);
db.ApiLog = ApiLogTable(Sequelize, sequelize);
db.IntegrationWebhookEvent = IntegrationWebhookEventTable(Sequelize, sequelize);
db.InvictusGeneralEnquiry = InvictusGeneralEnquiryTable(Sequelize, sequelize);
db.InvictusCareersApplication = InvictusCareersApplicationTable(Sequelize, sequelize);
db.BirthwaveDoctor = BirthwaveDoctorTable(Sequelize, sequelize);
db.BirthwaveLead = BirthwaveLeadTable(Sequelize, sequelize);
db.BirthwaveAppointment = BirthwaveAppointmentTable(Sequelize, sequelize);
db.BirthwaveLeadActivity = BirthwaveLeadActivityTable(Sequelize, sequelize);
db.BirthwaveWebsiteLead = BirthwaveWebsiteLeadTable(Sequelize, sequelize);
db.CrmCustomField = CrmCustomFieldTable(Sequelize, sequelize);
db.CrmCall = CrmCallTable(Sequelize, sequelize);
db.CrmIntegration = CrmIntegrationTable(Sequelize, sequelize);
db.CrmFieldMapping = CrmFieldMappingTable(Sequelize, sequelize);

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
addClientId(db.VlsConsumerProtectionLawMasterClass);
addClientId(db.VlsDopAiAssisted);
addClientId(db.VlsAiForAdvocates);
addClientId(db.VlsTaxationLaw);
addClientId(db.PixelEye);
addClientId(db.PixelEyeLeadState);
addClientId(db.AaravEyeCare);
addClientId(db.AntardrashtiNetralaya);
addClientId(db.Rio);
addClientId(db.PixelEyeWebsiteLead);

addClientId(db.ShantiEyeTech);
addClientId(db.PhoenixFitness);

addClientId(db.BirthwaveDoctor);
addClientId(db.BirthwaveLead);
addClientId(db.BirthwaveAppointment);
addClientId(db.BirthwaveLeadActivity);
addClientId(db.BirthwaveWebsiteLead);
addClientId(db.CrmCustomField);
addClientId(db.CrmCall);
addClientId(db.CrmIntegration);
addClientId(db.CrmFieldMapping);

// Birthwave relational graph
db.BirthwaveLead.belongsTo(db.BirthwaveDoctor, {
  foreignKey: "assigned_doctor_id",
  as: "assignedDoctor",
});
db.BirthwaveDoctor.hasMany(db.BirthwaveLead, { foreignKey: "assigned_doctor_id" });

db.BirthwaveAppointment.belongsTo(db.BirthwaveLead, {
  foreignKey: "lead_id",
  as: "lead",
});
db.BirthwaveLead.hasMany(db.BirthwaveAppointment, { foreignKey: "lead_id" });

db.BirthwaveAppointment.belongsTo(db.BirthwaveDoctor, {
  foreignKey: "doctor_id",
  as: "doctor",
});
db.BirthwaveDoctor.hasMany(db.BirthwaveAppointment, { foreignKey: "doctor_id" });

db.BirthwaveLeadActivity.belongsTo(db.BirthwaveLead, {
  foreignKey: "lead_id",
  as: "lead",
});
db.BirthwaveLead.hasMany(db.BirthwaveLeadActivity, { foreignKey: "lead_id" });

db.CrmCall.belongsTo(db.BirthwaveLead, { foreignKey: "lead_id", as: "lead" });
db.BirthwaveLead.hasMany(db.CrmCall, { foreignKey: "lead_id" });

export default db;






