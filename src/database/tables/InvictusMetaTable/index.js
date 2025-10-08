import { tableName } from "../tableName.js";

export const invictusMetaTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.INVICTUSMETAADDS, {
    name: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    mobile: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    business_name: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    bussiness_belongs: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    monthly_ad_budget: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    primary_goal_metads: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    metaad_run_before: {
      type: Sequelize.ENUM("yes", "no"),
      allowNull: true,
    },

    package_interested: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    planning_to_start: {
      type: Sequelize.STRING,
      allowNull: false,
    },

    registered_date: {
      type: Sequelize.DATE,
      allowNull: false,
    },

    ip_address: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    utm_source: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    createdAt: {
      type: "TIMESTAMP",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: true,
      field: "created_at",
    },

    updatedAt: {
      type: "TIMESTAMP",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: true,
      field: "updated_at",
    },
  });
};
