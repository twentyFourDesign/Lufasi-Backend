const db = require("../models");

// Mock initiate payment - in production create payment session with gateway
async function initiatePayment(req, res, next) {
  try {
    const { bookingId } = req.query.bookingId ? req.query : req.body;
    if (!bookingId)
      return res.status(400).json({ error: "bookingId required" });

    const booking = await db.Booking.findByPk(bookingId, {
      include: [db.GuestDirectory],
    });
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // create payment record (initiated)
    const txRef = `TX-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const pay = await db.BookingPayment.create({
      bookingId: booking.id,
      amount: booking.totalPrice,
      paymentMethod: "mock",
      paymentStatus: "initiated",
      transactionReference: txRef,
    });

    // in real system redirect to gateway; here return mock payment url that calls webhook
    const paymentUrl = `${process.env.APP_BASE_URL}/payments/mock-success?txRef=${txRef}&bookingId=${booking.id}`;

    res.json({ paymentUrl, txRef });
  } catch (err) {
    next(err);
  }
}

// Mock webhook to mark payment success
async function mockSuccess(req, res, next) {
  try {
    const { txRef, bookingId } = req.query;
    const payment = await db.BookingPayment.findOne({
      where: { transactionReference: txRef },
    });
    if (!payment) return res.status(404).send("payment not found");

    await payment.update({ paymentStatus: "successful", paidAt: new Date() });
    // update booking status
    const booking = await db.Booking.findByPk(bookingId);
    await booking.update({ bookingStatus: "paid" });

    // create payment record for admin
    await db.Payment.create({
      bookingReference: booking.bookingReference,
      guestName: "Guest",
      amount: booking.totalPrice,
      status: "paid",
    });

    await db.BookingLog.create({
      bookingId: booking.id,
      action: "Payment successful",
      oldStatus: "pending",
      newStatus: "paid",
    });

    res.send("Payment mocked as successful. You can close this page.");
  } catch (err) {
    next(err);
  }
}

module.exports = { initiatePayment, mockSuccess };
