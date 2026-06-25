import { Op } from "sequelize";
import db from "../index.js";
import {
  LEGACY_PIXEL_EYE_STATUS_MAP,
  STATUS_ENUM_VALUES,
  normalizePixelEyeStatus,
} from "../tables/PixelEyeTable/index.js";

const PIXEL_EYE_DAY_STATUS_COLUMNS = [
  "day_1",
  "day_2",
  "day_3",
  "day_4",
  "day_5",
];

const getEnumValues = (column) =>
  [...String(column?.type || "").matchAll(/'((?:''|[^'])*)'/g)].map((match) =>
    match[1].replace(/''/g, "'"),
  );

const columnHasExactFinalStatuses = (column) => {
  const values = getEnumValues(column);
  return (
    values.length === STATUS_ENUM_VALUES.length &&
    values.every((status, index) => status === STATUS_ENUM_VALUES[index])
  );
};

const migrateMainStatusColumn = async (
  queryInterface,
  pixelEyeTableName,
  columns,
) => {
  const column = columns.status;
  if (!column) return false;

  const isStringLike = /varchar|text|string/i.test(String(column?.type || ""));
  if (isStringLike && !/^enum/i.test(String(column?.type || ""))) {
    return false;
  }

  await queryInterface.changeColumn(pixelEyeTableName, "status", {
    type: db.Sequelize.STRING,
    allowNull: true,
  });

  return true;
};

const migrateLeadDayStatusColumn = async (
  queryInterface,
  pixelEyeTableName,
  columns,
  columnName,
) => {
  const column = columns[columnName];
  if (!column) return false;

  const isStringLike = /varchar|text|string/i.test(String(column?.type || ""));
  const isEnumLike = /^enum/i.test(String(column?.type || ""));

  if (!isStringLike || isEnumLike) {
    await queryInterface.changeColumn(pixelEyeTableName, columnName, {
      type: db.Sequelize.STRING,
      allowNull: true,
    });
  }

  let changed = !isStringLike || isEnumLike;
  for (const [legacyStatus, finalStatus] of Object.entries(
    LEGACY_PIXEL_EYE_STATUS_MAP,
  )) {
    if (legacyStatus === finalStatus) continue;
    const [updatedCount] = await db.PixelEye.update(
      { [columnName]: finalStatus },
      { where: { [columnName]: legacyStatus } },
    );
    changed = changed || updatedCount > 0;
  }

  // Normalize empty-string values to NULL so they don't block enum migration
  const [emptyUpdated] = await db.PixelEye.update(
    { [columnName]: null },
    { where: { [columnName]: "" } },
  );
  changed = changed || emptyUpdated > 0;

  return changed;
};

const migrateLeadStateLastStatus = async () => {
  let changed = false;

  for (const [legacyStatus, finalStatus] of Object.entries(
    LEGACY_PIXEL_EYE_STATUS_MAP,
  )) {
    if (legacyStatus === finalStatus) continue;
    const [updatedCount] = await db.PixelEyeLeadState.update(
      { last_status: finalStatus },
      { where: { last_status: legacyStatus } },
    );
    changed = changed || updatedCount > 0;
  }

  const invalidRows = await db.PixelEyeLeadState.findAll({
    attributes: ["id", "last_status"],
    where: {
      last_status: {
        [Op.not]: null,
      },
    },
    raw: true,
  });

  if (invalidRows.length > 0) {
    const invalidStatuses = [
      ...new Set(invalidRows.map((row) => row.last_status)),
    ];

    for (const val of invalidStatuses) {
      const normalized = normalizePixelEyeStatus(val);
      if (normalized && normalized !== val) {
        const [u] = await db.PixelEyeLeadState.update(
          { last_status: normalized },
          { where: { last_status: val } },
        );
        changed = changed || u > 0;
      }
    }
  }

  return changed;
};

export const ensurePixelEyeStatusEnums = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const pixelEyeTableName = db.PixelEye.getTableName();
  const columns = await queryInterface.describeTable(pixelEyeTableName);
  let changed = false;

  changed =
    (await migrateMainStatusColumn(
      queryInterface,
      pixelEyeTableName,
      columns,
    )) || changed;

  for (const columnName of PIXEL_EYE_DAY_STATUS_COLUMNS) {
    changed =
      (await migrateLeadDayStatusColumn(
        queryInterface,
        pixelEyeTableName,
        columns,
        columnName,
      )) || changed;
  }

  changed = (await migrateLeadStateLastStatus()) || changed;

  if (changed) {
    console.log(
      `[Schema] Aligned PixelEye status/day columns to string storage and normalized lead-state last_status values`,
    );
  }

  return changed;
};

export default ensurePixelEyeStatusEnums;
