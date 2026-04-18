require("dotenv").config();
const db = require("../src/models");

async function checkSchema() {
  try {
    console.log("Checking schema for table 'bookings'...");
    const tableInfo = await db.sequelize.queryInterface.describeTable("bookings");
    
    if (tableInfo.dome_details) {
      console.log("✅ dome_details column found!");
    } else {
      console.log("❌ dome_details column NOT found.");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Failed to check schema:", error);
    process.exit(1);
  }
}

checkSchema();
