import db from "../index.js";
import { tableName } from "../tables/tableName.js";

const TABLE = tableName.BIRTHWAVE_LEADS;

/**
 * A confirmed Repli `/leads` API record can be a valid, stable Instagram lead
 * with NO phone number collected (Repli's questionnaire may finish without
 * ever asking for one). Historical/webhook Repli leads may still be identified
 * by client_id + source_provider + source_external_id alone, so `phone` can no
 * longer be a hard NOT NULL constraint.
 *
 * Manual/API-driven lead creation (POST /birthwave/leads) is unaffected — it
 * still requires phone at the Joi validation layer
 * (middlewares/validation/birthwaveValidation.js); only the column-level
 * constraint is relaxed so Repli-sourced rows can omit it.
 */
export const ensureBirthwaveLeadPhoneNullable = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(TABLE);

  if (columns.phone && columns.phone.allowNull === false) {
    await queryInterface.changeColumn(TABLE, "phone", {
      type: db.Sequelize.STRING(30),
      allowNull: true,
    });
    console.log(`[Schema] Relaxed ${TABLE}.phone to allow NULL`);
    return true;
  }

  return false;
};

export default ensureBirthwaveLeadPhoneNullable;
