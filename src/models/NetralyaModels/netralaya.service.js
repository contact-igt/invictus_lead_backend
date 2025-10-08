import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createNetralyaRegisterService = async (
  name,
  mobile,
  ip_address,
  utm_source,
  page_name,
  enquiry_count,
  registered_date
) => {
  const Query = `INSERT INTO ${tableName?.NETRALAYA} (
  name,
  mobile,
  ip_address,
  utm_source,
  page_name,
  enquiry_count,
  registered_date
    ) VALUES (?,?,?,?,?,?,?)`;

  try {
    const Values = [
      name,
      mobile,
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

export const findNetralyaRegisterUserService = async (mobile, page_name) => {
  const Query = `SELECT * FROM ${tableName?.NETRALAYA} WHERE mobile = ? AND page_name = ? LIMIT 1`;

  try {
    const [result] = await db.sequelize.query(Query, {
      replacements: [mobile, page_name],
    });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const updateNetralyaRegistereUserService = async (
  enquiry_count,
  registered_date,
  mobile,
  page_name
) => {
  const Query = `UPDATE ${tableName?.NETRALAYA} SET enquiry_count = ? , registered_date = ?  WHERE mobile = ? AND page_name = ? `;

  try {
    const [result] = await db.sequelize.query(Query, {
      replacements: [enquiry_count, registered_date, mobile, page_name],
    });
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAllNetralyaRegisterService = async (req, res) => {
  const Query = `SELECT * FROM ${tableName?.NETRALAYA} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdNetralyaRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.NETRALAYA} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdNetralyaRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.NETRALAYA} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
