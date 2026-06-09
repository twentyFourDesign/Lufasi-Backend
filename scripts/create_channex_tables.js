/**
 * Migration: Channex channel manager tables + booking_source column.
 * Run once: node scripts/create_channex_tables.js
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const sequelize = require("../src/config/database");

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database.");

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS channex_booking_map (
        id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
        booking_id            VARCHAR(36)  NULL,
        channex_booking_id    VARCHAR(100) NOT NULL,
        channex_revision_id   VARCHAR(100) NULL,
        unique_id             VARCHAR(200) NULL,
        ota_reservation_code  VARCHAR(200) NULL,
        revision_system_id    VARCHAR(200) NULL UNIQUE,
        ota_name              VARCHAR(100) NULL,
        source                VARCHAR(50)  NOT NULL DEFAULT 'booking.com',
        last_revision_status  VARCHAR(20)  NULL,
        "createdAt"           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅  channex_booking_map table ready.");

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS channex_sync_log (
        id                VARCHAR(36)  NOT NULL PRIMARY KEY,
        sync_type         VARCHAR(50)  NOT NULL,
        status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
        idempotency_key   VARCHAR(200) NULL UNIQUE,
        payload           JSONB        NULL,
        result            JSONB        NULL,
        attempts          INTEGER      NOT NULL DEFAULT 0,
        last_error        TEXT         NULL,
        processed_at      TIMESTAMP    NULL,
        "createdAt"       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅  channex_sync_log table ready.");

    const [cols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'bookings'
        AND table_catalog = current_database()
        AND column_name = 'booking_source';
    `);

    if (cols.length === 0) {
      await sequelize.query(`
        ALTER TABLE bookings ADD COLUMN booking_source VARCHAR(50) NULL DEFAULT 'direct';
      `);
      console.log("✅  booking_source column added to bookings.");
    } else {
      console.log("ℹ️   booking_source column already exists — skipped.");
    }

    console.log("Migration complete.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
