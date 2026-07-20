import { Op } from "sequelize";

export const withCreatedAtRange = (where, start, end) => ({
  ...where,
  [Op.and]: [
    ...(Array.isArray(where?.[Op.and]) ? where[Op.and] : []),
    {
      created_at: {
        ...(start ? { [Op.gte]: start } : {}),
        ...(end ? { [Op.lte]: end } : {}),
      },
    },
  ],
});
