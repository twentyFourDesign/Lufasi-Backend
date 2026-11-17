"use strict";

// Whether a booking has received payment and may therefore be assigned a dome.
// Payment can come from Paystack, Squadco, a voucher, or a discount that
// covers the whole total; all of these settle the booking (status paid or
// confirmed). OTA bookings are collected by the OTA, so they are exempt.

const PAID_STATUSES = ["paid", "confirmed"];

function isOtaBooking(booking) {
  const src = booking.bookingSource;
  return Boolean(src) && src !== "direct";
}

/**
 * @param {object} booking Booking row
 * @param {(bookingId:number)=>Promise<boolean>} hasSuccessfulPayment
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function checkAssignable(booking, hasSuccessfulPayment) {
  if (isOtaBooking(booking)) return { ok: true };
  if (PAID_STATUSES.includes(booking.bookingStatus)) return { ok: true };
  // Already-allocated direct bookings: accept any successful payment record
  // (paystack, squadco, voucher, discount).
  if (
    booking.bookingStatus === "ready_for_checkin" &&
    (await hasSuccessfulPayment(booking.id))
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      "This booking has no confirmed payment (Paystack, Squadco, voucher or discount), so a dome cannot be assigned yet.",
  };
}

module.exports = { checkAssignable, isOtaBooking, PAID_STATUSES };
