import db from "../database/index.js";

const truncateTables = async () => {
  try {
    console.log("🧹 Attempting to truncate all tables...");
    
    // Disable foreign key checks to allow truncating tables with relations
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
    
    const models = Object.values(db.sequelize.models);
    
    for (const model of models) {
      console.log(`Truncating ${model.name}...`);
      await model.destroy({ truncate: { cascade: true }, force: true });
    }
    
    // Re-enable foreign key checks
    await db.sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
    
    console.log("✅ All tables truncated successfully (Data cleared, schema preserved).");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error truncating tables:", err.message);
    process.exit(1);
  }
};

truncateTables();
