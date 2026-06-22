/**
 * Write per-pod calendar rows when a booking is confirmed (paid).
 */
const db = require("../models");
const { iterStayNights, toYmd } = require("./weekdayPeakPricing");

async function writeCalendarForBooking(booking, { transaction } = {}) {
  if (!booking?.podId || !booking?.checkIn || !booking?.checkOut) return;

  const nights = iterStayNights(booking.checkIn, booking.checkOut);
  for (const night of nights) {
    await db.CalendarAvailability.create(
      {
        podId: booking.podId,
        date: toYmd(night),
        status: "booked",
        bookingId: booking.id,
      },
      { transaction },
    ).catch(() => {
      /* ignore duplicate date/pod rows */
    });
  }
}

module.exports = { writeCalendarForBooking };
