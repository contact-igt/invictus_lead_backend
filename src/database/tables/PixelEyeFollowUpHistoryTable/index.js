import { tableName } from "../tableName.js";

export const PIXEL_EYE_FOLLOW_UP_HISTORY_CHANGE_TYPES = [
  "CREATED",
  "UPDATED",
  "RESCHEDULED",
  "CLEARED",
  "AUTO_FROM_WEBHOOK",
  "MANUAL_FROM_FRONTEND",
];

export const PIXEL_EYE_FOLLOW_UP_HISTORY_SOURCE_TYPES = [
  "FRONTEND",
  "RUNO_WEBHOOK",
  "SYSTEM",
];

export const buildPixelEyeFollowUpHistoryCreateTableDefinition = (
  Sequelize,
  sequelize,
) => {
  return {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    client_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    lead_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    call_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    phone_number: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    customer_name: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    old_follow_up_date: {
      type: Sequelize.DATEONLY,
      allowNull: true,
    },
    new_follow_up_date: {
      type: Sequelize.DATEONLY,
      allowNull: true,
    },
    metadata: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    change_type: {
      type: Sequelize.ENUM(...PIXEL_EYE_FOLLOW_UP_HISTORY_CHANGE_TYPES),
      allowNull: false,
    },
    reason: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    changed_by_user_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    changed_by_name: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    source: {
      type: Sequelize.ENUM(...PIXEL_EYE_FOLLOW_UP_HISTORY_SOURCE_TYPES),
      allowNull: false,
    },
    created_at: {
      type: "TIMESTAMP",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
    updated_at: {
      type: "TIMESTAMP",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
  };
};

const buildModelAttributes = (Sequelize, sequelize) => ({
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  client_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  lead_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  call_id: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  phone_number: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  customer_name: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  old_follow_up_date: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
  new_follow_up_date: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
  metadata: {
    type: Sequelize.JSON,
    allowNull: true,
  },
  change_type: {
    type: Sequelize.ENUM(...PIXEL_EYE_FOLLOW_UP_HISTORY_CHANGE_TYPES),
    allowNull: false,
  },
  reason: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  changed_by_user_id: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  changed_by_name: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  source: {
    type: Sequelize.ENUM(...PIXEL_EYE_FOLLOW_UP_HISTORY_SOURCE_TYPES),
    allowNull: false,
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
});

export const PixelEyeFollowUpHistoryTable = (Sequelize, sequelize) => {
  return sequelize.define(
    tableName.PIXELEYE_FOLLOW_UP_HISTORY,
    buildModelAttributes(Sequelize, sequelize),
    {
      tableName: tableName.PIXELEYE_FOLLOW_UP_HISTORY,
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      indexes: [
        {
          fields: ["client_id", "call_id"],
          name: "pixel_eye_follow_up_history_client_call_idx",
        },
        {
          fields: ["client_id", "lead_id"],
          name: "pixel_eye_follow_up_history_client_lead_idx",
        },
        {
          fields: ["created_at"],
          name: "pixel_eye_follow_up_history_created_at_idx",
        },
      ],
    },
  );
};
