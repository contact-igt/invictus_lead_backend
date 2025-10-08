import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createMahimmyRegisterService = async (
  first_name,
  last_name,
  mobile,
  email,
  menu,
  message,
  registered_date,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.MAHIMMYFOODS} 
  (  
    first_name,
      last_name,
      mobile,
      email,
      menu,
      message,
      registered_date,
      ip_address,
      utm_source
  ) 
  VALUES (?,?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      first_name,
      last_name,
      mobile,
      email,
      menu,
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

export const getAllMahimmyRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.MAHIMMYFOODS} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdMahimmyRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.MAHIMMYFOODS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdMahimmyRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.MAHIMMYFOODS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
