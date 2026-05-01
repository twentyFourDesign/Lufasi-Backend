require("dotenv").config({ path: __dirname + "/.env" });
const db = require("./src/models");
async function alter() {
  try {
    await db.sequelize.query('ALTER TABLE "calendar_availabilities" ADD COLUMN "reason" VARCHAR(255);');
    console.log("Column added");
  } catch (err) {
    console.error(err.message);
  }
  process.exit();
}
alter();
