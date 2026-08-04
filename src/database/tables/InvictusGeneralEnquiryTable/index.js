export const InvictusGeneralEnquiryTable = (Sequelize, sequelize) => {
  return sequelize.define(
    "invictus_general_enquiries",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      mobile: {
        type: Sequelize.STRING(10),
        allowNull: false,
        validate: {
          is: /^[0-9]{10}$/,
        },
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      industry: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      applied_for: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "General Inquiry",
      },
      submitted_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("New", "Contacted", "In Progress", "Closed"),
        defaultValue: "New",
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      tableName: "invictus_general_enquiries",
      indexes: [
        {
          fields: ["submitted_at"],
        },
        {
          fields: ["status"],
        },
      ],
    }
  );
};
