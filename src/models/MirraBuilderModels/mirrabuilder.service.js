import db from "../../database/index.js";
import { tableName } from "../../database/tables/tableName.js";

export const createMirrabuildersRegisterService = async (
  name,
  mobile,
  interest_green_building,
  plot_build,
  budget,
  registered_date,
  ip_address,
  utm_source
) => {
  const Query = `INSERT INTO ${tableName?.MIRRABUILDERS} 
  (  
    name,
    mobile,
    interest_green_building,
    plot_build,
    budget,
    registered_date,
    ip_address,
    utm_source
  ) 
  VALUES (?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      name,
      mobile,
      interest_green_building,
      plot_build,
      budget,
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

export const getAllMirrabuildersRegisterService = async () => {
  const Query = `SELECT * FROM ${tableName?.MIRRABUILDERS} ORDER BY registered_date DESC`;

  try {
    const [result] = await db.sequelize.query(Query);
    return result;
  } catch (err) {
    throw err;
  }
};

export const getByIdMirrabuildersRegisterService = async (id) => {
  const Query = `SELECT * FROM ${tableName?.MIRRABUILDERS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result[0];
  } catch (err) {
    throw err;
  }
};

export const deleteByIdMirrabuildersRegisterService = async (id) => {
  const Query = `DELETE FROM ${tableName?.MIRRABUILDERS} WHERE id = ?`;

  try {
    const [result] = await db.sequelize.query(Query, { replacements: [id] });
    return result;
  } catch (err) {
    throw err;
  }
};
