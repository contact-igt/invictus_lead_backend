import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createRegisterService = async (
  name,
  email,
  mobile,
  course_interested
) => {
  const Query = `INSERT INTO ${tableName?.VLSLAWACADEMY} 
  (  name,
  email,
  mobile,
  course_interested) 
  VALUES (?,?,?,?)`;

  try {
    const values = [name, email, mobile, course_interested];

    const [result] = await db.sequelize.query(Query, { replacements: values });
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAllRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.VLSLAWACADEMY} ORDER BY ID DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.VLSLAWACADEMY} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.VLSLAWACADEMY} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
