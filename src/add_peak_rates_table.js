/**
 * Migration: Create peak_rates table and add peak rate snapshot columns to bookings table.
 * Run once: node src/add_peak_rates_table.js
 */
require("dotenv").config();
const sequelize = require("./config/database");

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database.");

    // 1. Create peak_rates table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS peak_rates (
        id          VARCHAR(36)    NOT NULL PRIMARY KEY,
        name        VARCHAR(100)   NOT NULL,
        start_date  DATE           NOT NULL,
        end_date    DATE           NOT NULL,
        percentage_adjustment DECIMAL(5,2) NOT NULL,
        is_active   BOOLEAN        NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅  peak_rates table created (or already exists).");

    // 2. Add peak rate snapshot columns to bookings table (if not already present)
    const [cols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'bookings'
        AND table_catalog = current_database()
        AND column_name = 'peak_rate_adjustment_percent';
    `);

    if (cols.length === 0) {
      await sequelize.query(`
        ALTER TABLE bookings
          ADD COLUMN peak_rate_adjustment_percent DECIMAL(5,2) NULL,
          ADD COLUMN peak_rate_name VARCHAR(100) NULL;
      `);
      console.log("✅  peak_rate_adjustment_percent and peak_rate_name columns added to bookings.");
    } else {
      console.log("ℹ️   peak_rate columns already exist in bookings — skipped.");
    }

    console.log("Migration complete.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
