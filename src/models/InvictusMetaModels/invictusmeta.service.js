import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createInvictusmetaRegisterService = async (
  name,
  mobile,
  business_name,
  bussiness_belongs,
  monthly_ad_budget,
  primary_goal_metads,
  metaad_run_before,
  package_interested,
  planning_to_start,
  registered_date,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.INVICTUSMETAADDS} 
  (  
    name,
      mobile,
      business_name,
      bussiness_belongs,
      monthly_ad_budget,
      primary_goal_metads,
      metaad_run_before,
      package_interested,
      planning_to_start,
      registered_date,
      ip_address,
      utm_source
  ) 
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      name,
      mobile,
      business_name,
      bussiness_belongs,
      monthly_ad_budget,
      primary_goal_metads,
      metaad_run_before,
      package_interested,
      planning_to_start,
      registered_date,
      ip_address,
      utm_source,
    ];

    const [result] = await db.sequelize.query(Query, { replacements: values });
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAllInvictusmetaRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.INVICTUSMETAADDS} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdInvictusmetaRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.INVICTUSMETAADDS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdInvictusmetaRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.INVICTUSMETAADDS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
