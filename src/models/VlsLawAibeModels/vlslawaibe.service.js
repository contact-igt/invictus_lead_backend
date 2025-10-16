import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createRegisterService = async (
  name,
  email,
  mobile,
  amount,
  programm_start_date,
  programm_end_date,
  registered_date,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  payment_status,
  captured,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.VLSLAWAIBE} 
  (
  
  name,
  email,
  mobile,
  amount,
  registered_date,
  programm_start_date,
    programm_end_date,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  payment_status,
  captured,
  ip_address,
  utm_source
  
  ) 
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      name,
      email,
      mobile,
      amount,
      registered_date,
      programm_start_date,
      programm_end_date,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_status,
      captured,
      ip_address,
      utm_source,
    ];

    const [result] = await db.sequelize.query(Query, { replacements: values });
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAllRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.VLSLAWAIBE} ORDER BY ID DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.VLSLAWAIBE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.VLSLAWAIBE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
