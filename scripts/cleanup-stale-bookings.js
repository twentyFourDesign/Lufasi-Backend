/**
 * One-off: expire stale pending bookings and clean orphan calendar rows.
 * Run: node scripts/cleanup-stale-bookings.js
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const bookingExpirationService = require("../src/services/bookingExpirationService");

async function main() {
  console.log("Cleaning stale pending bookings and calendar holds...");
  const count = await bookingExpirationService.expireOldBookings();
  console.log(`Done. Expired ${count} booking(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
