import { tableName } from "../tableName.js";

export const STATUS_ENUM_VALUES = [
  "Busy",
  "Not Answering",
  "Switched Off",
  "Missed Call",
  "On Another Call",
  "DND",
  "Dnp 1",
  "Dnp 2",
  "Dnp 3",
  "Dnp 4",
  "Not Speaking",
  "Disconnecting",
  "Not in Network",
  "Incoming Call Not Available",
  "Number Not in Service",
  "Wrong Number",
  "Wrongly Dialed",
  "Fraud Call",
  "Enquiry",
  "Hot Follow-up",
  "Follow-up Required",
  "Will Call Later",
  "Will Call & Take Appointment Later",
  "Medicine",
  "Rescheduling",
  "Doctor Time",
  "Follow-up Post Appointment",
  "Want to Speak With Doctor",
  "Appointment Fixed",
  "Appointment Cancelled",
  "Visited",
  "Walk-in",
  "Not Interested",
  "Not Willing to Come Now",
  "Searching for Specific Hospital",
  "Going to Other Hospital",
  "Not in Hyderabad",
  "Long Distance",
  "Address Requested",
  "Closed",
  "Others",
];

export const PixelEyeTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName?.PIXELEYE, {
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

    follow_up_date: {
      type: Sequelize.DATEONLY,
      allowNull: true,
    },

    status: {
      type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
      allowNull: true,
    },

    day_1: {
      type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
      allowNull: true,
    },

    day_2: {
      type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
      allowNull: true,
    },

    day_3: {
      type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
      allowNull: true,
    },

    day_4: {
      type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
      allowNull: true,
    },

    day_5: {
      type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
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
  }, {
    indexes: [
      {
        unique: true,
        fields: ["client_id", "call_id"],
        name: "pixel_eye_client_call_unique",
      },
    ],
  });
};
