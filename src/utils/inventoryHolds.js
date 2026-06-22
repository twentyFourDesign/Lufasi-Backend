/**
 * Shared rules for which bookings/calendar rows actually hold inventory.
 * Stale unpaid pending bookings must NEVER block availability.
 */
const db = require("../models");
const { Op } = require("sequelize");

const INACTIVE_BOOKING_STATUSES = [
  "expired",
  "cancelled",
  "failed",
  "abandoned",
];

/** Booking statuses that consume pooled pod capacity */
const POOL_HOLDING_STATUSES = [
  "pending",
  "paid",
  "confirmed",
  "confirmed_unassigned",
  "ready_for_checkin",
];

/**
 * True if this booking should block inventory right now.
 */
function isBookingHoldingInventory(booking) {
  if (!booking) return false;
  const status = booking.bookingStatus;
  if (INACTIVE_BOOKING_STATUSES.includes(status)) return false;
  if (status === "pending") {
    if (!booking.expiresAt) return true;
    return new Date(booking.expiresAt) >= new Date();
  }
  return POOL_HOLDING_STATUSES.includes(status);
}

/**
 * Sequelize WHERE fragment: active bookings that hold pooled capacity.
 */
function activeBookingWhere(extra = {}) {
  const now = new Date();
  const holdingStatuses = POOL_HOLDING_STATUSES.filter((s) => s !== "pending");

  return {
    ...extra,
    [Op.or]: [
      { bookingStatus: { [Op.in]: holdingStatuses } },
      { bookingStatus: "pending", expiresAt: { [Op.gte]: now } },
    ],
  };
}

/**
 * Calendar rows that should mark a physical pod as unavailable.
 */
async function getActiveCalendarRows({ dates, excludeBookingId } = {}) {
  const where = {
    date: { [Op.in]: dates },
    status: { [Op.in]: ["booked", "blocked"] },
  };

  if (excludeBookingId) {
    where.bookingId = { [Op.ne]: excludeBookingId };
  }

  const rows = await db.CalendarAvailability.findAll({ where });

  const bookingIds = [
    ...new Set(rows.map((r) => r.bookingId).filter(Boolean)),
  ];

  let bookingMap = {};
  if (bookingIds.length) {
    const bookings = await db.Booking.findAll({
      where: { id: { [Op.in]: bookingIds } },
      attributes: ["id", "bookingStatus", "expiresAt"],
    });
    bookingMap = Object.fromEntries(bookings.map((b) => [b.id, b]));
  }

  return rows.filter((row) => {
    if (row.status === "blocked") return true;
    if (!row.bookingId) return false;
    return isBookingHoldingInventory(bookingMap[row.bookingId]);
  });
}

module.exports = {
  INACTIVE_BOOKING_STATUSES,
  POOL_HOLDING_STATUSES,
  isBookingHoldingInventory,
  activeBookingWhere,
  getActiveCalendarRows,
};
