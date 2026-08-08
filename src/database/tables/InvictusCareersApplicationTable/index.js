export const InvictusCareersApplicationTable = (Sequelize, sequelize) => {
  return sequelize.define(
    "invictus_careers_applications",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      application_reference: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      role: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      role_slug: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      full_name: {
        type: Sequelize.STRING,
        allowNull: false,
        validate: {
          len: [2, 255],
        },
      },
      phone: {
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
      current_city: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      state: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notice_period: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      experience: {
        type: Sequelize.ENUM(
          "under_6_months",
          "6_to_11_months",
          "1_to_2_years",
          "2_to_4_years",
          "over_4_years"
        ),
        allowNull: false,
      },
      portfolio_or_showreel: {
        type: Sequelize.STRING(1000),
        allowNull: false,
      },
      resume_or_linkedin: {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
      tools: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      work_categories: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      workflow_answer: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      ai_usage: {
        type: Sequelize.ENUM("ai_primary", "ai_ideas", "ai_selective", "ai_rare"),
        allowNull: false,
      },
      judgement_answer: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      practical_assessment: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "No",
      },
      screening_flags: {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: [],
      },
      status: {
        type: Sequelize.ENUM("New", "Shortlisted", "Under Review", "Rejected", "Hired"),
        defaultValue: "New",
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      tableName: "invictus_careers_applications",
      indexes: [
        {
          fields: ["createdAt"],
        },
        {
          fields: ["role_slug"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["current_city"],
        },
        {
          fields: ["state"],
        },
        {
          fields: ["application_reference"],
          unique: true,
        },
      ],
    }
  );
};
