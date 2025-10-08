import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createNaitrikaRegisterService = async (
  name,
  mobile,
  email,
  service,
  message,
  registered_date,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.NITRIKAEYECARE} 
  (  
  name,
  mobile,
  email,
  service,
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
      service,
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

export const getAllNaitrikaRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.NITRIKAEYECARE} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdNaitrikaRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.NITRIKAEYECARE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdNaitrikaRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.NITRIKAEYECARE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
