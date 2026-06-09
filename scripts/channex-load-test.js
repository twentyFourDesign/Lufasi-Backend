/**
 * Channex concurrency / oversell load test.
 *
 * Simulates concurrent capacity checks against the inventory service
 * to verify advisory-lock prevents overselling beyond total pods.
 *
 * Usage:
 *   node scripts/channex-load-test.js
 *
 * Requires SUPABASE_DB_URL in .env (read-only checks, no bookings created).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const db = require("../src/models");
const {
  hasCapacityForStay,
  getAvailablePodsForDate,
  getPricingConfigOrDefault,
} = require("../src/services/inventoryService");
const { withAdvisoryLock, INVENTORY_LOCK_KEY } = require("../src/utils/advisoryLock");

const CHECK_IN = "2026-12-01";
const CHECK_OUT = "2026-12-05";
const CONCURRENT_REQUESTS = 20;
const PODS_PER_REQUEST = 1;

async function simulateBookingAttempt(id) {
  return withAdvisoryLock(db.sequelize, INVENTORY_LOCK_KEY, async () => {
    const ok = await hasCapacityForStay({
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      podsRequested: PODS_PER_REQUEST,
    });
    return { id, ok };
  });
}

async function run() {
  await db.sequelize.authenticate();
  const config = await getPricingConfigOrDefault();
  const totalPods = config.totalPodsAvailable || 6;

  console.log("=== Channex Load Test: Concurrent Capacity Checks ===");
  console.log(`Total pods: ${totalPods}`);
  console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Dates: ${CHECK_IN} → ${CHECK_OUT}`);
  console.log("");

  const availBefore = await getAvailablePodsForDate(CHECK_IN, config);
  console.log(`Available pods on ${CHECK_IN} (before): ${availBefore}`);
  console.log("");

  const start = Date.now();
  const results = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
      simulateBookingAttempt(i + 1),
    ),
  );
  const elapsed = Date.now() - start;

  const allowed = results.filter((r) => r.ok).length;
  const denied = results.filter((r) => !r.ok).length;

  console.log(`Completed in ${elapsed}ms`);
  console.log(`Allowed: ${allowed}, Denied: ${denied}`);
  console.log("");

  if (allowed > availBefore) {
    console.error(
      `FAIL: ${allowed} checks passed but only ${availBefore} pods available — potential oversell!`,
    );
    process.exit(1);
  }

  console.log("PASS: No oversell detected in concurrent capacity simulation.");
  console.log("");
  console.log("Note: Full end-to-end test requires Channex staging credentials");
  console.log("and the Channex PMS certification test suite.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
