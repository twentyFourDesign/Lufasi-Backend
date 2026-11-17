const crypto = require("crypto");
const beds24Config = require("../config/beds24Config");
const {
  triggerAriPush,
  previewAri,
  reconcileAvailability,
  SYNC_PUSH,
} = require("../services/beds24AriService");
const { triggerBookingPull, SYNC_PULL } = require("../services/beds24BookingImportService");
const { getRecentLogs, getLastSuccessful } = require("../services/channexSyncOutbox");

async function getStatus(_req, res, next) {
  try {
    const [lastPush, lastPull] = await Promise.all([
      getLastSuccessful(SYNC_PUSH),
      getLastSuccessful(SYNC_PULL),
    ]);
    res.json({
      ...beds24Config.getStatus(),
      lastAriPush: lastPush?.processedAt || null,
      lastBookingPull: lastPull?.processedAt || null,
    });
  } catch (err) {
    next(err);
  }
}

async function pushAri(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.body || {};
    res.json(await triggerAriPush({ dateFrom, dateTo }));
  } catch (err) {
    next(err);
  }
}

async function pullBookings(_req, res, next) {
  try {
    res.json(await triggerBookingPull());
  } catch (err) {
    next(err);
  }
}

async function getPreview(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query;
    const preview = await previewAri({ dateFrom, dateTo });
    res.json({ preview, count: preview.length });
  } catch (err) {
    next(err);
  }
}

async function getSyncLogs(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 50;
    // Beds24 entries share the sync log table; filter by their own types.
    const syncType = req.query.syncType || undefined;
    const logs = await getRecentLogs({ limit, syncType });
    res.json(syncType ? logs : logs.filter((l) => String(l.syncType).startsWith("beds24")));
  } catch (err) {
    next(err);
  }
}

async function reconcile(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query;
    res.json(await reconcileAvailability({ dateFrom, dateTo }));
  } catch (err) {
    next(err);
  }
}

function secretMatches(provided) {
  const expected = Buffer.from(beds24Config.webhookSecret);
  const given = Buffer.from(String(provided || ""));
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

/**
 * Public webhook: Beds24 tells us a booking changed. The body is not trusted
 * (its format is undocumented); we only use the call as a signal and pull the
 * changed bookings with our own authenticated request.
 *
 * Authenticated by a shared secret, sent as ?secret=... in the webhook URL or
 * as an x-webhook-secret header. Rejected outright if no secret is configured.
 */
async function handleWebhook(req, res, next) {
  try {
    if (!beds24Config.webhookSecret) {
      return res.status(503).json({ error: "Webhook secret not configured" });
    }
    const provided = req.headers["x-webhook-secret"] || req.query.secret;
    if (!secretMatches(provided)) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    res.status(200).json({ received: true });

    if (!beds24Config.enabled) return;
    triggerBookingPull().catch((err) =>
      console.error("[Beds24] Webhook-triggered pull failed:", err.message),
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatus,
  pushAri,
  pullBookings,
  getPreview,
  getSyncLogs,
  reconcile,
  handleWebhook,
};
