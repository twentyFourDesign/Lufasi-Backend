/**
 * Pooled dome inventory computation and atomic capacity reservation.
 */
const db = require("../models");
const { withAdvisoryLock, INVENTORY_LOCK_KEY } = require("../utils/advisoryLock");
const { iterStayNights, toYmd } = require("../utils/weekdayPeakPricing");

const ACTIVE_STATUSES = [
  "pending",
  "paid",
  "confirmed",
  "confirmed_unassigned",
  "ready_for_checkin",
];

async function getPricingConfigOrDefault() {
  const config = await db.PricingConfiguration.findByPk(1);
  return (
    config || {
      totalPodsAvailable: 6,
    }
  );
}

/**
 * Compute sellable pod count for a single night.
 */
async function getSoldPodsForDate(dateYmd, { transaction } = {}) {
  const date = new Date(dateYmd);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const bookings = await db.Booking.findAll({
    where: {
      bookingStatus: { [db.Sequelize.Op.in]: ACTIVE_STATUSES },
      checkIn: { [db.Sequelize.Op.lt]: nextDay },
      checkOut: { [db.Sequelize.Op.gt]: date },
    },
    transaction,
  });

  return bookings.reduce((sum, b) => {
    return sum + (b.podsCount || b.podCount || 1);
  }, 0);
}

/**
 * Count distinct blocked pods for a date.
 */
async function getBlockedPodsForDate(dateYmd, { transaction } = {}) {
  const rows = await db.CalendarAvailability.findAll({
    attributes: ["podId"],
    where: {
      date: dateYmd,
      status: "blocked",
    },
    transaction,
  });
  return new Set(rows.map((r) => r.podId)).size;
}

/**
 * Available pods for a single night.
 */
async function getAvailablePodsForDate(dateYmd, config, opts = {}) {
  const total = config.totalPodsAvailable || 6;
  const sold = await getSoldPodsForDate(dateYmd, opts);
  const blocked = await getBlockedPodsForDate(dateYmd, opts);
  return Math.max(0, total - sold - blocked);
}

/**
 * Build per-date availability map for a date range.
 */
async function computeAvailabilityMap(dateFrom, dateTo) {
  const config = await getPricingConfigOrDefault();
  const nights = iterStayNights(dateFrom, dateTo);
  const map = {};

  for (const night of nights) {
    const ymd = toYmd(night);
    map[ymd] = await getAvailablePodsForDate(ymd, config);
  }

  return { map, totalPods: config.totalPodsAvailable || 6 };
}

/**
 * Check if `podsRequested` can be accommodated for entire stay.
 */
async function hasCapacityForStay(
  { checkIn, checkOut, podsRequested },
  { transaction } = {},
) {
  const config = await getPricingConfigOrDefault();
  const nights = iterStayNights(checkIn, checkOut);

  for (const night of nights) {
    const ymd = toYmd(night);
    const available = await getAvailablePodsForDate(ymd, config, { transaction });
    if (available < podsRequested) return false;
  }
  return true;
}

/**
 * Atomically reserve capacity under advisory lock.
 * Returns { ok: true } or { ok: false, error }.
 */
async function reserveCapacityAtomic({ checkIn, checkOut, podsRequested }) {
  return withAdvisoryLock(db.sequelize, INVENTORY_LOCK_KEY, async (t) => {
    const ok = await hasCapacityForStay(
      { checkIn, checkOut, podsRequested },
      { transaction: t },
    );
    if (!ok) {
      return { ok: false, error: "Not enough pods available for the selected dates." };
    }
    return { ok: true, transaction: t };
  });
}

module.exports = {
  ACTIVE_STATUSES,
  getPricingConfigOrDefault,
  getSoldPodsForDate,
  getBlockedPodsForDate,
  getAvailablePodsForDate,
  computeAvailabilityMap,
  hasCapacityForStay,
  reserveCapacityAtomic,
};
