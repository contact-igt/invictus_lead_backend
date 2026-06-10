import db from "../index.js";
import { tableName } from "../tables/tableName.js";

const MANUAL_SCHEDULE_TYPE_VALUES = [
  "THIRTY_MIN",
  "DNP2",
  "TWENTY_FOUR_HR",
  "MANUAL",
];

export const ensurePixelEyeLeadStateManualScheduleType = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(tableName.PIXELEYE_LEAD_STATE);
  const scheduleTypeColumn = columns.schedule_type;

  if (!scheduleTypeColumn) {
    return false;
  }

  const currentType = String(scheduleTypeColumn.type || "");
  if (currentType.includes("MANUAL")) {
    return false;
  }

  await queryInterface.changeColumn(tableName.PIXELEYE_LEAD_STATE, "schedule_type", {
    type: db.Sequelize.ENUM(...MANUAL_SCHEDULE_TYPE_VALUES),
    allowNull: true,
  });

  console.log(
    `[Schema] Added MANUAL enum value to ${tableName.PIXELEYE_LEAD_STATE}.schedule_type`,
  );

  return true;
};

export default ensurePixelEyeLeadStateManualScheduleType;
