import { tableName } from "../tableName.js";

export const PIXEL_EYE_CALL_LOG_SOURCE_VALUES = ["RUNO_WEBHOOK", "SYSTEM"];

const buildCommonAttributes = (Sequelize, sequelize) => ({
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
    allowNull: true,
  },
  call_id: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  phone_number: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  normalized_phone_number: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  customer_name: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  agent_name: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  call_date: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
  call_time: {
    type: Sequelize.TIME,
    allowNull: true,
  },
  call_started_at: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  status: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  source: {
    type: Sequelize.ENUM(...PIXEL_EYE_CALL_LOG_SOURCE_VALUES),
    allowNull: false,
    defaultValue: "RUNO_WEBHOOK",
  },
  raw_payload: {
    type: Sequelize.JSON,
    allowNull: true,
  },
  direction: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  duration_seconds: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  recording_url: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  disposition: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  outcome_day_number: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  outcome_status: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  outcome_applied_at: {
    type: Sequelize.DATE,
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
});

export const buildPixelEyeCallLogCreateTableDefinition = (
  Sequelize,
  sequelize,
) => {
  const attributes = buildCommonAttributes(Sequelize, sequelize);

  return {
    id: attributes.id,
    client_id: attributes.client_id,
    lead_id: attributes.lead_id,
    call_id: attributes.call_id,
    phone_number: attributes.phone_number,
    normalized_phone_number: attributes.normalized_phone_number,
    customer_name: attributes.customer_name,
    agent_name: attributes.agent_name,
    call_date: attributes.call_date,
    call_time: attributes.call_time,
    call_started_at: attributes.call_started_at,
    status: attributes.status,
    source: attributes.source,
    raw_payload: attributes.raw_payload,
    direction: attributes.direction,
    duration_seconds: attributes.duration_seconds,
    recording_url: attributes.recording_url,
    disposition: attributes.disposition,
    outcome_day_number: attributes.outcome_day_number,
    outcome_status: attributes.outcome_status,
    outcome_applied_at: attributes.outcome_applied_at,
    created_at: attributes.createdAt,
    updated_at: attributes.updatedAt,
  };
};

export const PixelEyeCallLogTable = (Sequelize, sequelize) => {
  return sequelize.define(
    tableName.PIXELEYE_CALL_LOGS,
    buildCommonAttributes(Sequelize, sequelize),
    {
      tableName: tableName.PIXELEYE_CALL_LOGS,
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      indexes: [
        {
          fields: ["client_id", "normalized_phone_number", "call_date"],
          name: "pixel_eye_call_logs_client_phone_date_idx",
        },
        {
          fields: ["client_id", "call_id"],
          name: "pixel_eye_call_logs_client_call_idx",
        },
        {
          fields: ["client_id", "call_started_at"],
          name: "pixel_eye_call_logs_client_started_at_idx",
        },
        {
          fields: ["created_at"],
          name: "pixel_eye_call_logs_created_at_idx",
        },
      ],
    },
  );
};
