const db = require("../models");
const { v4: uuidv4 } = require("uuid");
const { priceCalculator } = require("../utils/priceCalculator");

// Helper to generate booking reference
function genRef() {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `LUF-${random}`;
}

// Create booking (public)
async function createBooking(req, res, next) {
  try {
    const {
      guest, // { fullName, email, phone, identificationType, identificationNumber }
      podId,
      checkIn,
      checkOut,
      boardType = "fullBoard",
      guests = {},
      popUpBeds = 0,
      extras = [],
      discountCode,
      voucherCode,
    } = req.body;

    // basic validations
    if (!guest || !guest.email || !podId || !checkIn || !checkOut) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }

    const pod = await db.Pod.findByPk(podId, { include: ["priceRules"] });
    if (!pod) return res.status(404).json({ error: "Pod not found" });

    // price calc
    const priceCalc = priceCalculator({
      pod,
      boardType,
      guests,
      popUpBeds,
      extras,
      podPriceRules: pod.priceRules,
    });

    // create or find guestDirectory
    let guestDir = await db.GuestDirectory.findOne({
      where: { email: guest.email },
    });
    if (!guestDir) {
      guestDir = await db.GuestDirectory.create({
        fullName: guest.fullName,
        email: guest.email,
        phone: guest.phone,
        identificationType: guest.identificationType,
        identificationNumber: guest.identificationNumber,
      });
    }

    const bookingRef = genRef();

    const booking = await db.Booking.create({
      bookingReference: bookingRef,
      guestDirectoryId: guestDir.id,
      podId,
      checkIn,
      checkOut,
      totalPrice: priceCalc.total,
      bookingStatus: "pending",
      boardType,
      popUpBeds,
    });

    // booking guests
    await db.BookingGuest.create({
      bookingId: booking.id,
      adults: guests.adults || 0,
      children: guests.children || 0,
      toddlers: guests.toddlers || 0,
      infants: guests.infants || 0,
    });

    // booking extras
    if (extras && extras.length) {
      for (const ex of extras) {
        const extraModel = await db.Extra.findByPk(ex.id);
        if (!extraModel) continue;
        await db.BookingExtra.create({
          bookingId: booking.id,
          extraId: extraModel.id,
          quantity: ex.quantity || 1,
          totalPrice: parseFloat(extraModel.price) * (ex.quantity || 1),
        });
      }
    }

    // Mark calendar as 'booked' for each date range
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      await db.CalendarAvailability.create({
        podId,
        date: new Date(d).toISOString().slice(0, 10),
        status: "booked",
        bookingId: booking.id,
      }).catch((e) => {
        /* ignore duplicates */
      });
    }

    // log
    await db.BookingLog.create({
      bookingId: booking.id,
      action: "Created booking",
      newStatus: "pending",
    });

    // Return payment link (mock) - in production create gateway session
    const paymentLink = `${process.env.APP_BASE_URL}/payments/initiate?bookingId=${booking.id}`;

    res.json({
      bookingId: booking.id,
      bookingReference: bookingRef,
      amountDue: priceCalc.total,
      paymentLink,
    });
  } catch (err) {
    next(err);
  }
}

// Admin: get bookings
async function listBookings(req, res, next) {
  try {
    const bookings = await db.Booking.findAll({
      include: [
        { model: db.GuestDirectory },
        { model: db.BookingGuest },
        { model: db.BookingPayment },
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
}

async function getBookingDetails(req, res, next) {
  try {
    const booking = await db.Booking.findByPk(req.params.id, {
      include: [
        { model: db.GuestDirectory },
        { model: db.BookingGuest },
        { model: db.BookingPayment },
        { model: db.BookingExtra, include: [{ model: db.Extra }] },
        { model: db.BookingLog },
      ],
    });
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
}

module.exports = { createBooking, listBookings, getBookingDetails };
