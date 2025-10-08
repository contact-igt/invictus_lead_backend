import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createWellinitRegisterService = async (
  name,
  mobile,
  email,
  provider,
  message,
  registered_date,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.WELLINIT} 
  (  
  name,
  mobile,
  email,
  provider,
  message,
  registered_date,
  ip_address,
  utm_source
  ) 
  VALUES (?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      name,
      mobile,
      email,
      provider,
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

export const getAllWellinitRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.WELLINIT} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdWellinitRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.WELLINIT} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdWellinitRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.WELLINIT} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
