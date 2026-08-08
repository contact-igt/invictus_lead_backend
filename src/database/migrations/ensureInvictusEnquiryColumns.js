import db from "../index.js";

export const ensureInvictusEnquiryColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();

  try {
    const generalColumns = await queryInterface.describeTable("invictus_general_enquiries");

    if (!Object.prototype.hasOwnProperty.call(generalColumns, "city")) {
      await queryInterface.addColumn("invictus_general_enquiries", "city", {
        type: db.Sequelize.STRING,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_general_enquiries.city");
    }

    if (!Object.prototype.hasOwnProperty.call(generalColumns, "state")) {
      await queryInterface.addColumn("invictus_general_enquiries", "state", {
        type: db.Sequelize.STRING,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_general_enquiries.state");
    }

    if (!Object.prototype.hasOwnProperty.call(generalColumns, "notes")) {
      await queryInterface.addColumn("invictus_general_enquiries", "notes", {
        type: db.Sequelize.TEXT,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_general_enquiries.notes");
    }
  } catch (err) {
    // Table may not exist yet; sequelize.sync() will create it with all columns.
  }

  try {
    const careerColumns = await queryInterface.describeTable("invictus_careers_applications");

    if (!Object.prototype.hasOwnProperty.call(careerColumns, "state")) {
      await queryInterface.addColumn("invictus_careers_applications", "state", {
        type: db.Sequelize.STRING,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_careers_applications.state");
    }

    if (!Object.prototype.hasOwnProperty.call(careerColumns, "notes")) {
      await queryInterface.addColumn("invictus_careers_applications", "notes", {
        type: db.Sequelize.TEXT,
        allowNull: true,
      });
      console.log("[Schema] Added missing column invictus_careers_applications.notes");
    }
  } catch (err) {
    // Table may not exist yet; sequelize.sync() will create it with all columns.
  }

  return true;
};

export default ensureInvictusEnquiryColumns;
