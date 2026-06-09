/**
 * Outbox pattern for Channex sync operations — idempotency, retries, logging.
 */
const { v4: uuidv4 } = require("uuid");
const db = require("../models");

const MAX_ATTEMPTS = 5;

async function enqueueSync({
  syncType,
  payload = {},
  idempotencyKey = null,
}) {
  const key =
    idempotencyKey ||
    `${syncType}:${JSON.stringify(payload).slice(0, 200)}:${Date.now()}`;

  const [entry, created] = await db.ChannexSyncLog.findOrCreate({
    where: { idempotencyKey: key },
    defaults: {
      id: uuidv4(),
      syncType,
      status: "pending",
      idempotencyKey: key,
      payload,
      attempts: 0,
    },
  });

  if (!created && entry.status === "success") {
    return { entry, skipped: true };
  }

  if (!created && entry.status === "processing") {
    return { entry, skipped: true };
  }

  if (!created) {
    await entry.update({ status: "pending", payload });
  }

  return { entry, skipped: false };
}

async function markProcessing(entry) {
  await entry.update({
    status: "processing",
    attempts: (entry.attempts || 0) + 1,
  });
}

async function markSuccess(entry, result = {}) {
  await entry.update({
    status: "success",
    result,
    processedAt: new Date(),
    lastError: null,
  });
}

async function markFailed(entry, error) {
  const msg = error?.message || String(error);
  const status = (entry.attempts || 0) >= MAX_ATTEMPTS ? "failed" : "pending";
  await entry.update({
    status,
    lastError: msg,
    processedAt: status === "failed" ? new Date() : null,
  });
}

async function getRecentLogs({ limit = 50, syncType } = {}) {
  const where = {};
  if (syncType) where.syncType = syncType;

  return db.ChannexSyncLog.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
  });
}

async function getLastSuccessful(syncType) {
  return db.ChannexSyncLog.findOne({
    where: { syncType, status: "success" },
    order: [["processedAt", "DESC"]],
  });
}

async function processPendingRetries(handler, syncType) {
  const pending = await db.ChannexSyncLog.findAll({
    where: {
      syncType,
      status: "pending",
      attempts: { [db.Sequelize.Op.lt]: MAX_ATTEMPTS },
    },
    order: [["createdAt", "ASC"]],
    limit: 10,
  });

  for (const entry of pending) {
    try {
      await markProcessing(entry);
      const result = await handler(entry.payload || {});
      await markSuccess(entry, result);
    } catch (err) {
      await markFailed(entry, err);
    }
  }
}

module.exports = {
  enqueueSync,
  markProcessing,
  markSuccess,
  markFailed,
  getRecentLogs,
  getLastSuccessful,
  processPendingRetries,
  MAX_ATTEMPTS,
};
