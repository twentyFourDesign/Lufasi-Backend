require("dotenv").config();
const db = require("../src/models");

async function syncDB() {
  try {
    console.log("Checking database connection...");
    await db.sequelize.authenticate();
    console.log("Database connection established.");

    console.log("Synchronizing schema (alter: true)...");
    await db.sequelize.sync({ alter: true });
    console.log("Database synchronized successfully.");
    
    process.exit(0);
  } catch (error) {
    console.error("Failed to synchronize database:", error);
    process.exit(1);
  }
}

syncDB();
