export function neyaniLeadTable({ DataTypes: T }, sequelize) {
  return sequelize.define("NeyaniLead", {
    client_id: { type: T.INTEGER, allowNull: false },
    request_id: { type: T.UUID, allowNull: false },
    name: { type: T.STRING(150), allowNull: false },
    phone: { type: T.STRING(20), allowNull: false },
    treatment: T.STRING(150),
    message: T.TEXT,
    source: { type: T.STRING(60), allowNull: false },
    sheet_status: { type: T.STRING(16), allowNull: false, defaultValue: "pending" },
    email_status: { type: T.STRING(16), allowNull: false, defaultValue: "pending" },
    attempts: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
    next_attempt_at: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
  }, {
    tableName: "neyani_website_leads",
    underscored: true,
    indexes: [
      { unique: true, fields: ["client_id", "request_id"] },
      { fields: ["email_status", "next_attempt_at"] },
    ],
  });
}
