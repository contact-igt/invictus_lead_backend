// Safe migration: add `metadata` column to PixelEyeFollowUpHistory if missing.
import db from "../../database/index.js";

const qi = () => db.sequelize.getQueryInterface();

export const ensureAddFollowUpHistoryMetadataColumn = async () => {
  const table = "pixel_eye_follow_up_history";
  const column = "metadata";

  try {
    const [results] = await db.sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`,
    );

    if (Array.isArray(results) && results.length > 0) {
      console.log(`[Migration] Column ${column} already exists on ${table}`);
      return;
    }

    // Try adding JSON column first using QueryInterface
    try {
      await qi().addColumn(table, column, {
        type: db.Sequelize.JSON,
        allowNull: true,
      });
      console.log(`[Migration] Added JSON column ${column} to ${table}`);
      return;
    } catch (jsonErr) {
      console.warn(
        `[Migration] JSON column add failed, attempting TEXT fallback: ${jsonErr.message}`,
      );
    }

    // Fallback to TEXT
    try {
      await qi().addColumn(table, column, {
        type: db.Sequelize.TEXT,
        allowNull: true,
      });
      console.log(
        `[Migration] Added TEXT column ${column} to ${table} as fallback`,
      );
      return;
    } catch (textErr) {
      console.error(
        `[Migration] Failed to add metadata column as TEXT: ${textErr.message}`,
      );
      throw textErr;
    }
  } catch (err) {
    console.error(
      "[Migration] ensureAddFollowUpHistoryMetadataColumn failed:",
      err.message || err,
    );
    throw err;
  }
};

export default ensureAddFollowUpHistoryMetadataColumn;
