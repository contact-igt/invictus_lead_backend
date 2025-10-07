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

    ad_budget: {
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

    package: {
      type: Sequelize.ENUM("starter", "growth", "premium", "not sure yet"),
      allowNull: true,
    },

    planning_to_start: {
      type: Sequelize.ENUM(
        "immediately",
        "within 1 week",
        "in 2-3 weeks",
        "next month",
        "just exploring"
      ),
      allowNull: false,
    },

    registered_date: {
      type: Sequelize.DATE,
      allowNull: false,
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
