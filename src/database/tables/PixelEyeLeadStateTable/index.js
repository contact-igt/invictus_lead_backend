import { tableName } from "../tableName.js";

export const PixelEyeLeadStateTable = (Sequelize, sequelize) => {
  return sequelize.define(
    tableName.PIXELEYE_LEAD_STATE,
    {
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: tableName.CLIENTS, key: "id" },
      },

      call_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // Mirrors lead fields so we can build the notification message
      // without re-fetching the lead every time.
      customer_name: { type: Sequelize.STRING, allowNull: true },
      phone_number:  { type: Sequelize.STRING, allowNull: true },
      agent_name:    { type: Sequelize.STRING, allowNull: true },

      last_status: { type: Sequelize.STRING, allowNull: true },

      // Lifecycle state — mirrors the Google Script's state.state field.
      state: {
        type: Sequelize.ENUM("new", "scheduled", "completed", "cancelled", "baseline"),
        defaultValue: "new",
        allowNull: false,
      },

      // Which callback window was scheduled.
      schedule_type: {
        type: Sequelize.ENUM("THIRTY_MIN", "DNP2", "TWENTY_FOUR_HR"),
        allowNull: true,
      },

      reason: { type: Sequelize.STRING, allowNull: true },

      // Exact UTC datetime when the notification should fire.
      scheduled_at: { type: Sequelize.DATE, allowNull: true },

      notification_sent:    { type: Sequelize.BOOLEAN, defaultValue: false },
      notification_sent_at: { type: Sequelize.DATE,    allowNull: true },

      // After the first THIRTY_MIN callback fires, Day 1 stops auto-mirroring.
      thirty_min_cycle_completed: { type: Sequelize.BOOLEAN, defaultValue: false },

      // 'auto'   → day_1 mirrors status on every update
      // 'manual' → agent controls day_1 manually after first 30-min fires
      day1_mode: {
        type: Sequelize.ENUM("auto", "manual"),
        defaultValue: "auto",
        allowNull: false,
      },

      permanently_closed: { type: Sequelize.BOOLEAN, defaultValue: false },
      cancel_reason:      { type: Sequelize.STRING,  allowNull: true },

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
          name: "pixel_eye_lead_state_client_call_unique",
        },
        {
          // Scheduler query: find all rows due for notification
          fields: ["state", "scheduled_at", "notification_sent"],
          name: "pixel_eye_lead_state_scheduler_idx",
        },
      ],
    },
  );
};
