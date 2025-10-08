import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createInvictusRegisterService = async (
  name,
  mobile,
  email,
  service,
  description,
  registered_date,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.INVICTUS} 
  (  
  name,
  mobile,
  email,
  service,
  description,
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
      description,
      registered_date,
      ip_address,
      utm_source,
    ];

    console.log("sss" , values)

    const [result] = await db.sequelize.query(Query, { replacements: values });
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAllInvictusRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.INVICTUS} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdInvictusRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.INVICTUS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdInvictusRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.INVICTUS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
