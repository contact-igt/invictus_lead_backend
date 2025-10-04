import bcrypt from "bcrypt";
import { tableName } from "../../database/tables/tableName.js";
import db from "../../database/index.js";

export const createManagementService = async (
  title,
  username,
  email,
  country_code,
  mobile,
  profile_picture,
  password,
  role
) => {
  const passwordhashed = await bcrypt.hash(password, 10);

  const Query = `INSERT INTO ${tableName?.MANAGEMENT} (
   title,
  username,
  email,
  country_code,
  mobile,
  profile_picture,
  password,
  role) VALUES (?,?,?,?,?,?,?,?)`;

  try {
    const values = [
      title,
      username,
      email,
      country_code,
      mobile,
      profile_picture,
      passwordhashed,
      role,
    ];

    const [result] = await db.sequelize.query(Query, { replacements: values });
    return result;
  } catch (err) {
    throw err;
  }
};

export const loginManagementService = async (email) => {
  try {
    const Query = `SELECT * FROM ${tableName?.MANAGEMENT} WHERE email = ? `;

    const [result] = await db.sequelize.query(Query, {
      replacements: [email],
    });
    return result[0];
  } catch (err) {
    throw err;
  }
};
