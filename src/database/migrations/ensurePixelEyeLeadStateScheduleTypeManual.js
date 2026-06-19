import db from "../index.js";
import { tableName } from "../tables/tableName.js";

const SCHEDULE_TYPE_VALUES = [
  "THIRTY_MIN",
  "DNP2",
  "TWENTY_FOUR_HR",
  "FORTY_EIGHT_HR",
  "MANUAL",
];

export const ensurePixelEyeLeadStateScheduleTypes = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(tableName.PIXELEYE_LEAD_STATE);
  const scheduleTypeColumn = columns.schedule_type;

  if (!scheduleTypeColumn) {
    return false;
  }

  const currentType = String(scheduleTypeColumn.type || "");
  if (SCHEDULE_TYPE_VALUES.every((value) => currentType.includes(value))) {
    return false;
  }

  await queryInterface.changeColumn(tableName.PIXELEYE_LEAD_STATE, "schedule_type", {
    type: db.Sequelize.ENUM(...SCHEDULE_TYPE_VALUES),
    allowNull: true,
  });

  console.log(
    `[Schema] Ensured schedule type enum values on ${tableName.PIXELEYE_LEAD_STATE}.schedule_type`,
  );

  return true;
};

export default ensurePixelEyeLeadStateScheduleTypes;
