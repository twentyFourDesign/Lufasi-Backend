require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env")
});
const app = require("./app");
const db = require("./models");
const {
  ensureExtrasCategoryColumns,
} = require("./utils/ensureExtrasCategoryColumns");
const { ensureWeekdayPeakColumns } = require("./utils/ensureWeekdayPeakColumns");
const { ensureWeekdayPriceColumns } = require("./utils/ensureWeekdayPriceColumns");

const PORT = process.env.PORT || 4000;

async function init() {
  try {
    // Sync database -- in production, replace with migrations
    await db.sequelize.authenticate();
    console.log("Database connected.");
    // Skip sync locally - tables already exist on Supabase
    // sync() fails with PgBouncer pooler (cache lookup errors)
    try {
      await ensureExtrasCategoryColumns(db.sequelize);
      await ensureWeekdayPeakColumns(db.sequelize);
      await ensureWeekdayPriceColumns(db.sequelize);
    } catch (schemaErr) {
      console.error(
        "[init] Failed to ensure schema columns:",
        schemaErr.message,
      );
      throw schemaErr;
    }
    console.log("Database synced.");



    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

init();
