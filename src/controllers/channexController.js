const channexConfig = require("../config/channexConfig");
const channexService = require("../services/channexService");
const {
  triggerAriPush,
  previewAri,
  reconcileAvailability,
} = require("../services/channexAriService");
const { triggerBookingPull } = require("../services/channexBookingImportService");
const { getRecentLogs, getLastSuccessful } = require("../services/channexSyncOutbox");

async function getStatus(_req, res, next) {
  try {
    const [lastAri, lastPull] = await Promise.all([
      getLastSuccessful("push-ari"),
      getLastSuccessful("pull-bookings"),
    ]);

    res.json({
      ...channexConfig.getStatus(),
      lastAriPush: lastAri?.processedAt || null,
      lastBookingPull: lastPull?.processedAt || null,
    });
  } catch (err) {
    next(err);
  }
}

async function pushAri(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.body || {};
    const result = await triggerAriPush({ dateFrom, dateTo });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function pullBookings(_req, res, next) {
  try {
    const result = await triggerBookingPull();
    res.json(result);
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
    const syncType = req.query.syncType || undefined;
    const logs = await getRecentLogs({ limit, syncType });
    res.json(logs);
  } catch (err) {
    next(err);
  }
}

async function reconcile(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query;
    const result = await reconcileAvailability({ dateFrom, dateTo });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Public webhook — Channex notifies us of new booking revisions.
 * We pull the feed rather than trusting the webhook body alone.
 */
async function handleWebhook(req, res, next) {
  try {
    const signature =
      req.headers["x-channex-signature"] ||
      req.headers["x-webhook-signature"] ||
      "";

    if (!channexConfig.webhookSecret) {
      return res.status(503).json({ error: "Webhook secret not configured" });
    }

    // Verify against the bytes Channex sent (captured in app.js), not a re-serialised copy.
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (!channexService.verifyWebhookSignature(signature, rawBody)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    // Acknowledge immediately, process async
    res.status(200).json({ received: true });

    triggerBookingPull().catch((err) => {
      console.error("[Channex] Webhook-triggered pull failed:", err.message);
    });
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
