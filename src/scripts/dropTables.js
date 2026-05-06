import db from "../database/index.js";

const dropTables = async () => {
  try {
    console.log("⚠️  Attempting to drop all tables...");
    
    // Disable foreign key checks to allow dropping tables with relations
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
    
    // Drop all tables defined in the models
    await db.sequelize.drop();
    
    // Re-enable foreign key checks
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
    
    console.log("✅ All tables dropped successfully.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error dropping tables:", err.message);
    process.exit(1);
  }
};

dropTables();
