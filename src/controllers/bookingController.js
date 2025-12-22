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
      dates, // { checkIn, checkOut }
      contact,
      podId,
      boardType = "fullBoard",
      guests, // { adults, teenagers, infants }
      popUpBeds = 0,
      extras = [],
      discountCode,
      voucherCode,
    } = req.body;

    // Handle both new BookingDraft structure and legacy structure
    const bookingData = {
      podId: podId,
      checkIn: dates?.checkIn,
      checkOut: dates?.checkOut,
      boardType: boardType,
      guests: {
        adults: guests?.adults || 0,
        children: guests?.teenagers || 0,
        toddlers: 0,
        infants: guests?.infants || 0,
      },
      contact: contact
        ? {
            fullName: `${contact.firstName} ${contact.lastName}`,
            email: contact.email,
            phone: contact.phone,
            gender: contact.gender,
            dateOfBirth: contact.dob,
            identificationType: "",
            identificationNumber: "",
          }
        : null,
      extras: extras || [],
      popUpBeds,
      discountCode,
      voucherCode,
    };

    // Basic validations
    if (
      !bookingData.contact ||
      !bookingData.contact.email ||
      !bookingData.podId ||
      !bookingData.checkIn ||
      !bookingData.checkOut
    ) {
      return res.status(400).json({
        error: "Missing required booking fields",
        required: [
          "guest/contact info",
          "podId/pod",
          "checkIn/dates.checkIn",
          "checkOut/dates.checkOut",
        ],
      });
    }

    const podRecord = await db.Pod.findByPk(bookingData.podId, {
      include: ["priceRules"],
    });
    if (!podRecord) return res.status(404).json({ error: "Pod not found" });

    // Price calculation
    const priceCalc = priceCalculator({
      pod: podRecord,
      boardType: bookingData.boardType,
      guests: bookingData.guests,
      popUpBeds: bookingData.popUpBeds,
      extras: bookingData.extras,
      podPriceRules: podRecord.priceRules,
    });

    // Create or find guest directory
    let guestDir = await db.GuestDirectory.findOne({
      where: { email: bookingData.contact.email },
    });

    if (!guestDir) {
      guestDir = await db.GuestDirectory.create({
        fullName: bookingData.contact.fullName,
        email: bookingData.contact.email,
        phone: bookingData.contact.phone,
        gender: bookingData.contact.gender,
        dateOfBirth: bookingData.contact.dateOfBirth,
        identificationType: bookingData.contact.identificationType,
        identificationNumber: bookingData.contact.identificationNumber,
      });
    }

    const bookingRef = genRef();

    const booking = await db.Booking.create({
      bookingReference: bookingRef,
      guestDirectoryId: guestDir.id,
      podId: bookingData.podId,
      checkIn: bookingData.checkIn,
      checkOut: bookingData.checkOut,
      totalPrice: priceCalc.total,
      bookingStatus: "pending",
      boardType: bookingData.boardType,
      popUpBeds: bookingData.popUpBeds,
    });

    // booking guests
    await db.BookingGuest.create({
      bookingId: booking.id,
      adults: bookingData.guests.adults || 0,
      children: bookingData.guests.children || 0,
      toddlers: bookingData.guests.toddlers || 0,
      infants: bookingData.guests.infants || 0,
    });

    // booking extras
    if (bookingData.extras && bookingData.extras.length) {
      for (const ex of bookingData.extras) {
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
    const start = new Date(bookingData.checkIn);
    const end = new Date(bookingData.checkOut);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      await db.CalendarAvailability.create({
        podId: bookingData.podId,
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
