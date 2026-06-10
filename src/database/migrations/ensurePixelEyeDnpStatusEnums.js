import db from "../index.js";
import { STATUS_ENUM_VALUES } from "../tables/PixelEyeTable/index.js";

const PIXEL_EYE_STATUS_COLUMNS = [
  "status",
  "day_1",
  "day_2",
  "day_3",
  "day_4",
  "day_5",
];

const REQUIRED_DNP_VALUES = ["Dnp 1", "Dnp 3", "Dnp 4"];

const columnHasRequiredDnpValues = (column) => {
  const type = String(column?.type || "");
  return REQUIRED_DNP_VALUES.every((value) => type.includes(value));
};

export const ensurePixelEyeDnpStatusEnums = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const pixelEyeTableName = db.PixelEye.getTableName();
  const columns = await queryInterface.describeTable(pixelEyeTableName);
  let changed = false;

  for (const columnName of PIXEL_EYE_STATUS_COLUMNS) {
    const column = columns[columnName];

    if (!column || columnHasRequiredDnpValues(column)) {
      continue;
    }

    await queryInterface.changeColumn(pixelEyeTableName, columnName, {
      type: db.Sequelize.ENUM(...STATUS_ENUM_VALUES),
      allowNull: true,
    });

    changed = true;
  }

  if (changed) {
    console.log(
      `[Schema] Ensured DNP status enum values on ${pixelEyeTableName}`,
    );
  }

  return changed;
};

export default ensurePixelEyeDnpStatusEnums;
