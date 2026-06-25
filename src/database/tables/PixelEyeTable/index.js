import { tableName } from "../tableName.js";
import {
  DAY_OUTCOME_STATUSES,
  LEGACY_PIXEL_EYE_STATUS_MAP,
  normalizePixelEyeOutcomeStatus,
} from "../../../modules/pixelEye/pixelEyeStatusPolicy.js";

export const STATUS_ENUM_VALUES = DAY_OUTCOME_STATUSES;
export { LEGACY_PIXEL_EYE_STATUS_MAP };

export const normalizePixelEyeStatus = (status) => {
  return normalizePixelEyeOutcomeStatus(status);
};

export const PixelEyeTable = (Sequelize, sequelize) => {
  return sequelize.define(
    tableName.PIXELEYE,
    {
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: tableName.CLIENTS,
          key: "id",
        },
      },

      date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },

      time: {
        type: Sequelize.TIME,
        allowNull: true,
      },

      call_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      customer_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      phone_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      normalized_phone_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      agent_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      source: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      type_of_enquiry: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      follow_up_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      day_1: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      day_2: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      day_3: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      day_4: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      day_5: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: "TIMESTAMP",
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        allowNull: false,
        field: "created_at",
      },

      updatedAt: {
        type: "TIMESTAMP",
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        allowNull: false,
        field: "updated_at",
      },
    },
    {
      indexes: [
        {
          unique: true,
          fields: ["client_id", "call_id"],
          name: "pixel_eye_client_call_unique",
        },
      ],
      tableName: tableName.PIXELEYE,
      freezeTableName: true,
    },
  );
};
