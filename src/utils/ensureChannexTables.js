/**
 * Ensure Channex tables exist at server startup (idempotent).
 */
async function ensureChannexTables(sequelize) {
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
  }
}

module.exports = { ensureChannexTables };
