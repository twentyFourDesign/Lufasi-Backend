const cron = require("node-cron");
const channexConfig = require("../config/channexConfig");
const directSequelize = require("../config/directDatabase");
const db = require("../models");
const bookingExpirationService = require("../services/bookingExpirationService");
const { triggerAriPush, reconcileAvailability } = require("../services/channexAriService");
const { triggerBookingPull } = require("../services/channexBookingImportService");
const { processPendingRetries } = require("../services/channexSyncOutbox");
const emailService = require("../services/emailService");
const emailConfig = require("../config/emailConfig");

const CRON_LOCK_KEY = 847292;

async function withCronLock(fn) {
  const t = await directSequelize.transaction();
  try {
    const [[row]] = await directSequelize.query(
      "SELECT pg_try_advisory_xact_lock(:key) AS acquired",
      {
        replacements: { key: CRON_LOCK_KEY },
        transaction: t,
      }
    );
    const acquired = Boolean(row?.acquired);
    if (!acquired) {
      await t.rollback();
      return;
    }

    try {
      await fn();
    } finally {
      await t.commit();
    }
  } catch (err) {
    try {
      await t.rollback();
    } catch (rollbackErr) {
      // Ignore if transaction was already finished
    }
    throw err;
  }
}

function startScheduler() {
  // Expire stale pending bookings every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    withCronLock(async () => {
      const count = await bookingExpirationService.expireOldBookings();
      if (count > 0) {
        console.log(`[Scheduler] Expired ${count} pending bookings`);
      }
    }).catch((err) =>
      console.error("[Scheduler] Expiry job failed:", err.message),
    );
  });

  if (!channexConfig.enabled) {
    console.log("[Scheduler] Channex disabled — skipping channel manager jobs");
    return;
  }

  // Pull OTA bookings every 2 minutes
  cron.schedule("*/2 * * * *", () => {
    withCronLock(async () => {
      await triggerBookingPull();
    }).catch((err) =>
      console.error("[Scheduler] Booking pull failed:", err.message),
    );
  });

  // Full ARI re-sync nightly at 02:00
  cron.schedule("0 2 * * *", () => {
    withCronLock(async () => {
      await triggerAriPush({});
      console.log("[Scheduler] Nightly ARI full sync completed");
    }).catch((err) =>
      console.error("[Scheduler] Nightly ARI sync failed:", err.message),
    );
  });

  // Reconcile availability drift daily at 03:00
  cron.schedule("0 3 * * *", () => {
    withCronLock(async () => {
      const result = await reconcileAvailability({});
      if (result.driftCount > 0) {
        console.warn(
          `[Scheduler] ARI drift detected: ${result.driftCount} date(s)`,
          result.drifts,
        );
        if (emailConfig.isConfigured() && emailConfig.adminEmail) {
          await emailService
            .sendEmail({
              to: emailConfig.adminEmail,
              subject: `Channex ARI drift: ${result.driftCount} date(s)`,
              html: `<pre>${JSON.stringify(result.drifts, null, 2)}</pre>`,
            })
            .catch(() => {});
        }
        // Auto-heal: push corrected availability
        await triggerAriPush({
          dateFrom: result.from,
          dateTo: result.to,
        });
      }
    }).catch((err) =>
      console.error("[Scheduler] Reconciliation failed:", err.message),
    );
  });

  // Retry failed sync log entries every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    withCronLock(async () => {
      await processPendingRetries(
        async (payload) => triggerAriPush(payload),
        "push-ari",
      );
    }).catch((err) =>
      console.error("[Scheduler] Sync retry failed:", err.message),
    );
  });

  console.log("[Scheduler] Channel manager jobs registered");
}

module.exports = { startScheduler };
