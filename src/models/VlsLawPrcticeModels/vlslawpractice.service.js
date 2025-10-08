import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createRegisterService = async (
  name,
  email,
  mobile,
  amount,
  programm_date,
  registered_date,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  payment_status,
  captured,
  page_name
) => {
  const Query = `INSERT INTO ${tableName?.VLSLAWPRACTISE} 
  (name, 
  email, 
  mobile,
  amount, 
  programm_date,
  registered_date,
  razorpay_order_id,	
  razorpay_payment_id,
  razorpay_signature,	
  payment_status,	
  captured, 
  page_name) 
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      name,
      email,
      mobile,
      amount,
      programm_date,
      registered_date,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_status,
      captured,
      page_name,
    ];

    const [result] = await db.sequelize.query(Query, { replacements: values });
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAllRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.VLSLAWPRACTISE} ORDER BY ID DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.VLSLAWPRACTISE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.VLSLAWPRACTISE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
