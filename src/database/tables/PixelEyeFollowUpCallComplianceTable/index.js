import { tableName } from "../tableName.js";

export const PIXEL_EYE_FOLLOW_UP_COMPLIANCE_STATUS_VALUES = [
  "PENDING",
  "CALLED",
  "MISSED",
  "IGNORED",
  "CANCELLED",
];

export const PIXEL_EYE_FOLLOW_UP_COMPLIANCE_SOURCE_VALUES = [
  "SYSTEM",
  "FRONTEND",
  "RUNO_WEBHOOK",
  "SCHEDULER",
];

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
  scheduled_follow_up_date: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
  scheduled_follow_up_at: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  allowed_until: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  compliance_status: {
    type: Sequelize.ENUM(...PIXEL_EYE_FOLLOW_UP_COMPLIANCE_STATUS_VALUES),
    allowNull: false,
    defaultValue: "PENDING",
  },
  matched_call_log_id: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  matched_call_id: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  matched_call_started_at: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  reason: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  source: {
    type: Sequelize.ENUM(...PIXEL_EYE_FOLLOW_UP_COMPLIANCE_SOURCE_VALUES),
    allowNull: false,
    defaultValue: "SYSTEM",
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

export const buildPixelEyeFollowUpCallComplianceCreateTableDefinition = (
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
    scheduled_follow_up_date: attributes.scheduled_follow_up_date,
    scheduled_follow_up_at: attributes.scheduled_follow_up_at,
    allowed_until: attributes.allowed_until,
    compliance_status: attributes.compliance_status,
    matched_call_log_id: attributes.matched_call_log_id,
    matched_call_id: attributes.matched_call_id,
    matched_call_started_at: attributes.matched_call_started_at,
    reason: attributes.reason,
    source: attributes.source,
    created_at: attributes.createdAt,
    updated_at: attributes.updatedAt,
  };
};

export const PixelEyeFollowUpCallComplianceTable = (Sequelize, sequelize) => {
  return sequelize.define(
    tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE,
    buildCommonAttributes(Sequelize, sequelize),
    {
      tableName: tableName.PIXELEYE_FOLLOW_UP_CALL_COMPLIANCE,
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      indexes: [
        {
          fields: ["client_id", "normalized_phone_number", "scheduled_follow_up_date"],
          name: "pixel_eye_follow_up_call_compliance_client_phone_date_idx",
        },
        {
          fields: ["client_id", "call_id"],
          name: "pixel_eye_follow_up_call_compliance_client_call_idx",
        },
        {
          fields: ["compliance_status", "allowed_until"],
          name: "pixel_eye_follow_up_call_compliance_status_allowed_idx",
        },
        {
          fields: ["client_id", "compliance_status"],
          name: "pixel_eye_follow_up_call_compliance_client_status_idx",
        },
        {
          fields: ["created_at"],
          name: "pixel_eye_follow_up_call_compliance_created_at_idx",
        },
      ],
    },
  );
};
