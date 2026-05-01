require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const db = require("./models");

async function run() {
  try {
    await db.sequelize.authenticate();
    await db.sequelize.query('ALTER TABLE calendar_availabilities ADD COLUMN reason VARCHAR(255);');
    console.log("Column added successfully!");
  } catch (err) {
    if (err.message.includes('already exists')) {
        console.log("Column already exists.");
    } else {
        console.error("Error:", err);
    }
  } finally {
    process.exit(0);
  }
}

run();
