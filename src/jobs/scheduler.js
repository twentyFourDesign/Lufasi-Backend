const cron = require("node-cron");
const channexConfig = require("../config/channexConfig");
const beds24Config = require("../config/beds24Config");
const directSequelize = require("../config/directDatabase");
const db = require("../models");
const bookingExpirationService = require("../services/bookingExpirationService");
const { triggerAriPush, reconcileAvailability } = require("../services/channexAriService");
const { triggerBookingPull } = require("../services/channexBookingImportService");
const { processPendingRetries } = require("../services/channexSyncOutbox");
const beds24Ari = require("../services/beds24AriService");
const { triggerBookingPull: triggerBeds24Pull } = require("../services/beds24BookingImportService");
const emailService = require("../services/emailService");
const emailConfig = require("../config/emailConfig");

const CRON_LOCK_KEY = 847292;
const BEDS24_CRON_LOCK_KEY = 847293;

async function withCronLock(fn, lockKey = CRON_LOCK_KEY) {
  const t = await directSequelize.transaction();
  try {
    const [[row]] = await directSequelize.query(
      "SELECT pg_try_advisory_xact_lock(:key) AS acquired",
      {
        replacements: { key: lockKey },
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

function registerBeds24Jobs() {
  const guarded = (label, fn) =>
    withCronLock(fn, BEDS24_CRON_LOCK_KEY).catch((err) =>
      console.error(`[Scheduler] ${label} failed:`, err.message),
    );

  // Pull Beds24 bookings every 2 minutes (the webhook triggers an extra pull sooner)
  cron.schedule("*/2 * * * *", () => {
    guarded("Beds24 booking pull", async () => {
      await triggerBeds24Pull();
    });
  });

  // Full availability and price re-sync nightly at 02:30
  cron.schedule("30 2 * * *", () => {
    guarded("Beds24 nightly sync", async () => {
      await beds24Ari.triggerAriPush({});
      console.log("[Scheduler] Beds24 nightly full sync completed");
    });
  });

  // Compare with Beds24 daily at 03:30, heal and email on drift
  cron.schedule("30 3 * * *", () => {
    guarded("Beds24 reconciliation", async () => {
      const result = await beds24Ari.reconcileAvailability({});
      if (result.driftCount > 0) {
        console.warn(`[Scheduler] Beds24 drift: ${result.driftCount} date(s)`, result.drifts);
        if (emailConfig.isConfigured() && emailConfig.adminEmail) {
          await emailService
            .sendEmail({
              to: emailConfig.adminEmail,
              subject: `Beds24 availability drift: ${result.driftCount} date(s)`,
              html: `<pre>${JSON.stringify(result.drifts, null, 2)}</pre>`,
            })
            .catch(() => {});
        }
        await beds24Ari.triggerAriPush({ dateFrom: result.from, dateTo: result.to });
      }
    });
  });

  // Retry failed pushes every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    guarded("Beds24 push retry", async () => {
      await processPendingRetries(
        async (payload) => beds24Ari.pushAriToBeds24(payload),
        beds24Ari.SYNC_PUSH,
      );
    });
  });

  console.log("[Scheduler] Beds24 jobs registered");
}

function startScheduler() {
  // Expire stale pending bookings every 5 minutes.
  // No advisory lock — must never silently skip (pooler-safe cleanup is internal).
  cron.schedule("*/5 * * * *", () => {
    bookingExpirationService
      .expireOldBookings()
      .then((count) => {
        if (count > 0) {
          console.log(`[Scheduler] Expired ${count} pending bookings`);
        }
      })
      .catch((err) =>
        console.error("[Scheduler] Expiry job failed:", err.message),
      );
  });

  if (beds24Config.enabled) {
    registerBeds24Jobs();
  } else {
    console.log("[Scheduler] Beds24 disabled - skipping Beds24 jobs");
  }

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
