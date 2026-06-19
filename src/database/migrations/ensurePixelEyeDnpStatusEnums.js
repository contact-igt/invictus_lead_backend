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

const columnHasAllStatusValues = (column) => {
  const type = String(column?.type || "");
  return STATUS_ENUM_VALUES.every((value) => type.includes(value));
};

export const ensurePixelEyeStatusEnums = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const pixelEyeTableName = db.PixelEye.getTableName();
  const columns = await queryInterface.describeTable(pixelEyeTableName);
  let changed = false;

  for (const columnName of PIXEL_EYE_STATUS_COLUMNS) {
    const column = columns[columnName];

    if (!column || columnHasAllStatusValues(column)) {
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
      `[Schema] Ensured status enum values on ${pixelEyeTableName}`,
    );
  }

  return changed;
};

export default ensurePixelEyeStatusEnums;
