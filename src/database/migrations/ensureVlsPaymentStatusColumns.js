import db from "../index.js";
import { tableName } from "../tables/tableName.js";

export const ensureVlsPaymentStatusColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();

  const vlsTables = [
    tableName.VLSLAWPROPERTY,
    tableName.VLSLAWFAMILY,
    tableName.VLSLAWPRACTISE,
    tableName.VLSLAWAIBE,
    tableName.VLS_MACT_MASTER_CLASS,
    tableName.VLS_CONSUMER_PROTECTION_LAW_MASTER_CLASS,
    tableName.VLS_DOP_AI_ASSISTED,
  ].filter(Boolean);

  for (const table of vlsTables) {
    try {
      const columns = await queryInterface.describeTable(table);
      if (columns && columns.payment_status) {
        // Change column to VARCHAR(50) NULL so any status (including waitlist) can be stored seamlessly
        await db.sequelize.query(
          `ALTER TABLE \`${table}\` MODIFY COLUMN \`payment_status\` VARCHAR(50) NULL;`
        );
        console.log(`[Schema] Updated ${table}.payment_status to VARCHAR(50) NULL`);
      }
    } catch (err) {
      console.warn(`[Schema Warning] Could not alter payment_status on ${table}:`, err.message);
    }
  }

  return true;
};

export default ensureVlsPaymentStatusColumns;
