/**
 * Postgres advisory locks for single-runner cron safety and inventory concurrency.
 * Lock key 847291 = pooled dome inventory.
 */
const INVENTORY_LOCK_KEY = 847291;

async function withAdvisoryLock(sequelize, lockKey, fn, { transaction } = {}) {
  const t = transaction || (await sequelize.transaction());
  const ownTransaction = !transaction;

  try {
    await sequelize.query("SELECT pg_advisory_xact_lock(:key)", {
      replacements: { key: lockKey },
      transaction: t,
    });
    const result = await fn(t);
    if (ownTransaction) await t.commit();
    return result;
  } catch (err) {
    if (ownTransaction) await t.rollback();
    throw err;
  }
}

module.exports = {
  INVENTORY_LOCK_KEY,
  withAdvisoryLock,
};
