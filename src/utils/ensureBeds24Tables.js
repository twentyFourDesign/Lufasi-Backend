/**
 * Ensure the Beds24 mapping table exists at server startup (idempotent).
 * The sync log table is shared with the existing channel-manager outbox.
 */
async function ensureBeds24Tables(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS beds24_booking_map (
      id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
      booking_id         VARCHAR(36)  NULL,
      beds24_booking_id  VARCHAR(50)  NOT NULL UNIQUE,
      channel            VARCHAR(100) NULL,
      api_reference      VARCHAR(200) NULL,
      last_status        VARCHAR(30)  NULL,
      last_modified      VARCHAR(40)  NULL,
      "createdAt"        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS beds24_booking_map_booking_id ON beds24_booking_map (booking_id);`,
  );
}

module.exports = { ensureBeds24Tables };
