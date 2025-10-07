import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createPixelRegisterService = async (
  name,
  mobile,
  age,
  city,
  ip_address,
  utm_source,
  page_name,
  enquiry_count,
  registered_date
) => {
  const Query = `INSERT INTO ${tableName?.PIXELEYE} (
  name,
  mobile,
  age,
  city,
  ip_address,
  utm_source,
  page_name,
  enquiry_count,
  registered_date
    ) VALUES (?,?,?,?,?,?,?,?,?)`;

  try {
    const Values = [
      name,
      mobile,
      age,
      city,
      ip_address,
      utm_source,
      page_name,
      enquiry_count,
      registered_date,
    ];
    const [result] = await db.sequelize.query(Query, { replacements: Values });
    return result;
  } catch (err) {
    throw err;
  }
};

export const findPixeRegisterUserService = async (mobile, page_name) => {
  const Query = `SELECT * FROM ${tableName?.PIXELEYE} WHERE mobile = ? AND page_name = ? LIMIT 1`;

  try {
    const [result] = await db.sequelize.query(Query, {
      replacements: [mobile, page_name],
    });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const updatePixelRegistereUserService = async (
  enquiry_count,
  registered_date,
  mobile,
  page_name
) => {
  const Query = `UPDATE ${tableName?.PIXELEYE} SET enquiry_count = ? , registered_date = ?  WHERE mobile = ? AND page_name = ? `;

  try {
    const [result] = await db.sequelize.query(Query, {
      replacements: [enquiry_count, registered_date, mobile, page_name],
    });
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAllPixelRegisterService = async (req, res) => {
  const Query = `SELECT * FROM ${tableName?.PIXELEYE} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdPixelRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.PIXELEYE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdPixelRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.PIXELEYE} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
