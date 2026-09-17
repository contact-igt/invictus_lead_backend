import { tableName } from "../tableName.js";

// Unified "Course Details" leads — every course's Enroll Now / Download
// Syllabus form on the VLS main site (vls-frontend), across ALL courses,
// in one table. `course` carries the course name (also the Google Sheet tab
// it mirrors into); `submission_type` distinguishes the two form intents.
export const vlsCourseDetailsTable = (Sequelize, sequelize) => {
  return sequelize.define(tableName.VLS_COURSE_DETAILS, {
    client_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: tableName.CLIENTS, key: "id" },
    },
    name: { type: Sequelize.STRING, allowNull: true },
    mobile: { type: Sequelize.STRING, allowNull: true },
    email: { type: Sequelize.STRING, allowNull: true, validate: { isEmail: true } },
    course: { type: Sequelize.STRING, allowNull: false },
    submission_type: {
      type: Sequelize.ENUM("register_now", "download_syllabus"),
      allowNull: false,
    },
    call_time: { type: Sequelize.STRING, allowNull: true },
    class_mode: { type: Sequelize.STRING, allowNull: true },
    ip_address: { type: Sequelize.STRING, allowNull: true },
    utm_source: { type: Sequelize.STRING, allowNull: true },

    sheet_sync_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "pending" },
    sheet_sync_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    sheet_sync_last_error: { type: Sequelize.TEXT, allowNull: true },
    sheet_synced_at: { type: Sequelize.DATE, allowNull: true },
    sheet_sync_next_attempt_at: { type: Sequelize.DATE, allowNull: true },

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
      { name: "idx_vls_course_client_id", fields: ["client_id"] },
      { name: "idx_vls_course_name", fields: ["course"] },
      { name: "idx_vls_course_submission_type", fields: ["submission_type"] },
      { name: "idx_vls_course_sheet_sync", fields: ["sheet_sync_status", "sheet_sync_next_attempt_at"] },
    ],
  });
};
