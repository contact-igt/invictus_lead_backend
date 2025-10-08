import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createRamananFinancialRegisterService = async (
  name,
  email,
  mobile,
  area_of_interest,
  message,
  registered_date,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.RAMANANFINANCIAL} 
  (  
  name,
  email,
  mobile,
  area_of_interest,
  message,
  registered_date,
  ip_address ,	
  utm_source
  ) 
  VALUES (?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      name,
      email,
      mobile,
      area_of_interest,
      message,
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

export const getAllRamananFinancialRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.RAMANANFINANCIAL} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdRamananFinancialRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.RAMANANFINANCIAL} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdRamananFinancialRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.RAMANANFINANCIAL} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
