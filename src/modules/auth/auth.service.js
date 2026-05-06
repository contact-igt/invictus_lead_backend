import db from "../../database/index.js";

export const loginService = async (email) => {
  return await db.Management.findOne({
    where: { email },
    include: [
      {
        model: db.Client,
        as: "client",
        attributes: ["id", "name", "client_key"],
      },
    ],
  });
};
