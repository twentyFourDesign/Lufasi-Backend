const crypto = require("crypto");
const db = require("../models");
const { v4: uuidv4 } = require("uuid");
const { priceCalculator } = require("../utils/priceCalculator");
const emailService = require("../services/emailService");

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
    } else {
      await guestDir.update({
        fullName: bookingData.contact.fullName,
        phone: bookingData.contact.phone,
        gender: bookingData.contact.gender,
        dateOfBirth: bookingData.contact.dateOfBirth,
        identificationType: bookingData.contact.identificationType,
        identificationNumber: bookingData.contact.identificationNumber,
      });
    }

    const bookingRef = genRef();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

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
      expiresAt: expiresAt,
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

    // Generate cryptographically secure payment token
    const paymentToken = crypto.randomBytes(32).toString("hex");

    // Store payment token with same expiry as booking
    await db.PaymentToken.create({
      token: paymentToken,
      bookingId: booking.id,
      expiresAt: expiresAt,
    });

    // Payment link uses opaque token, not bookingId
    const paymentLink = `${process.env.APP_BASE_URL}/payments/pay/${paymentToken}`;

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

// Find booking by reference and last name (public)
async function findBooking(req, res, next) {
  try {
    const { bookingReference, lastName } = req.body;

    if (!bookingReference || !lastName) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["bookingReference", "lastName"],
      });
    }

    const booking = await db.Booking.findOne({
      where: { bookingReference },
      include: [
        {
          model: db.GuestDirectory,
          where: db.sequelize.where(
            db.sequelize.fn(
              "LOWER",
              db.sequelize.col("GuestDirectory.fullName")
            ),
            "LIKE",
            `%${lastName.toLowerCase()}%`
          ),
        },
        { model: db.Pod, include: [{ model: db.PodImage, as: "images" }] },
        { model: db.BookingGuest },
        { model: db.BookingExtra, include: [{ model: db.Extra }] },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found",
        message: "No booking found with the provided reference and last name",
      });
    }

    // Calculate number of nights
    const checkInDate = new Date(booking.checkIn);
    const checkOutDate = new Date(booking.checkOut);
    const numberOfNights = Math.ceil(
      (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
    );

    // Parse guest names from the guest's fullName
    const fullName = booking.GuestDirectory.fullName;
    const [firstName, ...lastNameParts] = fullName.split(" ");
    const guestLastName = lastNameParts.join(" ");

    // Format booking data to match BookingDraft structure
    const bookingDraft = {
      // Basic booking info
      id: booking.id,
      reference: booking.bookingReference,
      status: booking.bookingStatus,

      // Dates
      dates: {
        checkIn: new Date(booking.checkIn),
        checkOut: new Date(booking.checkOut),
      },
      numberOfNights,

      // Guests
      guests: {
        adults: booking.BookingGuests?.[0]?.adults || 0,
        teenagers: booking.BookingGuests?.[0]?.children || 0,
        infants: booking.BookingGuests?.[0]?.infants || 0,
      },

      // Pod information
      pod: booking.Pod
        ? {
          id: booking.Pod.id.toString(),
          title: booking.Pod.podName,
          desc: booking.Pod.description || "",
          price: parseFloat(booking.Pod.baseAdultPrice || 0),
          available: true,
          tags: booking.Pod.amenities ? booking.Pod.amenities.split(",") : [],
          img: booking.Pod.images?.[0]?.imageUrl || "",
        }
        : null,

      // Meal plan (board type)
      mealPlan: {
        id: booking.boardType,
        boardType: booking.boardType,
        title: booking.boardType === "fullBoard" ? "Full Board" : "Half Board",
        subtitle:
          booking.boardType === "fullBoard"
            ? "Breakfast, Lunch & Dinner"
            : "Breakfast & Lunch",
        items: [],
        price: 0,
        isActive: true,
      },

      // Pricing
      basePrice: parseFloat(booking.Pod?.baseAdultPrice || 0),
      subTotal: parseFloat(booking.totalPrice),

      // Extras
      extras:
        booking.BookingExtras?.map((be) => ({
          id: be.Extra.id.toString(),
          name: be.Extra.name,
          category: be.Extra.category,
          quantity: be.quantity,
          price: parseFloat(be.Extra.price),
          totalPrice: parseFloat(be.totalPrice),
        })) || [],

      // Contact information
      contact: {
        firstName,
        lastName: guestLastName,
        email: booking.GuestDirectory.email,
        phone: booking.GuestDirectory.phone,
        gender: booking.GuestDirectory.gender,
        dob: booking.GuestDirectory.dateOfBirth
          ? new Date(booking.GuestDirectory.dateOfBirth)
          : null,
        instruction: booking.GuestDirectory.instructions,
        guestNames: [],
      },

      // Payment info
      payment: {
        method: "card",
      },

      // Additional properties
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };

    res.json({
      success: true,
      booking: bookingDraft,
    });
  } catch (err) {
    next(err);
  }
}

// Update existing booking (public/admin)
async function updateBooking(req, res, next) {
  try {
    const { id } = req.params;
    const {
      dates,
      contact,
      podId,
      boardType,
      guests,
      popUpBeds,
      extras = [],
      bookingStatus,
    } = req.body;

    // Find existing booking
    const existingBooking = await db.Booking.findByPk(id, {
      include: [
        { model: db.GuestDirectory },
        { model: db.BookingGuest },
        { model: db.BookingExtra },
      ],
    });

    if (!existingBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Update booking data
    const updateData = {};
    if (dates?.checkIn) updateData.checkIn = dates.checkIn;
    if (dates?.checkOut) updateData.checkOut = dates.checkOut;
    if (podId) updateData.podId = podId;
    if (boardType) updateData.boardType = boardType;
    if (popUpBeds !== undefined) updateData.popUpBeds = popUpBeds;
    if (bookingStatus) updateData.bookingStatus = bookingStatus;

    // Recalculate price if pod, guests, or extras changed
    if (podId || guests || extras.length > 0 || popUpBeds !== undefined) {
      const podRecord = await db.Pod.findByPk(podId || existingBooking.podId, {
        include: ["priceRules"],
      });

      if (podRecord) {
        const guestData = guests || {
          adults: existingBooking.BookingGuests?.[0]?.adults || 0,
          teenagers: existingBooking.BookingGuests?.[0]?.children || 0,
          infants: existingBooking.BookingGuests?.[0]?.infants || 0,
        };

        const priceCalc = priceCalculator({
          pod: podRecord,
          boardType: boardType || existingBooking.boardType,
          guests: {
            adults: guestData.adults,
            children: guestData.teenagers,
            toddlers: 0,
            infants: guestData.infants,
          },
          popUpBeds:
            popUpBeds !== undefined ? popUpBeds : existingBooking.popUpBeds,
          extras: extras,
          podPriceRules: podRecord.priceRules,
        });

        updateData.totalPrice = priceCalc.total;
      }
    }

    // Update booking
    await existingBooking.update(updateData);

    // Update guest directory if contact info provided
    if (contact) {
      const guestDir = existingBooking.GuestDirectory;
      const guestUpdateData = {};

      if (contact.firstName && contact.lastName) {
        guestUpdateData.fullName = `${contact.firstName} ${contact.lastName}`;
      }
      if (contact.email) guestUpdateData.email = contact.email;
      if (contact.phone) guestUpdateData.phone = contact.phone;
      if (contact.gender) guestUpdateData.gender = contact.gender;
      if (contact.dob) guestUpdateData.dateOfBirth = contact.dob;
      if (contact.instruction)
        guestUpdateData.instructions = contact.instruction;

      if (Object.keys(guestUpdateData).length > 0) {
        await guestDir.update(guestUpdateData);
      }
    }

    // Update booking guests if provided
    if (guests) {
      const bookingGuest = existingBooking.BookingGuests?.[0];
      if (bookingGuest) {
        await bookingGuest.update({
          adults: guests.adults || bookingGuest.adults,
          children: guests.teenagers || bookingGuest.children,
          infants: guests.infants || bookingGuest.infants,
        });
      }
    }

    // Update extras if provided
    if (extras.length > 0) {
      // Remove old extras
      await db.BookingExtra.destroy({ where: { bookingId: id } });

      // Add new extras
      for (const ex of extras) {
        const extraModel = await db.Extra.findByPk(ex.id);
        if (extraModel) {
          await db.BookingExtra.create({
            bookingId: id,
            extraId: extraModel.id,
            quantity: ex.quantity || 1,
            totalPrice: parseFloat(extraModel.price) * (ex.quantity || 1),
          });
        }
      }
    }

    // Update calendar availability if dates changed
    if (dates?.checkIn || dates?.checkOut) {
      // Remove old calendar entries
      await db.CalendarAvailability.destroy({
        where: { bookingId: id },
      });

      // Add new calendar entries
      const checkIn = dates?.checkIn || existingBooking.checkIn;
      const checkOut = dates?.checkOut || existingBooking.checkOut;
      const start = new Date(checkIn);
      const end = new Date(checkOut);

      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        await db.CalendarAvailability.create({
          podId: podId || existingBooking.podId,
          date: new Date(d).toISOString().slice(0, 10),
          status: "booked",
          bookingId: id,
        }).catch((e) => {
          /* ignore duplicates */
        });
      }
    }

    // Log the update
    await db.BookingLog.create({
      bookingId: id,
      action: "Updated booking",
      newStatus: bookingStatus || existingBooking.bookingStatus,
    });

    // Return updated booking
    const updatedBooking = await db.Booking.findByPk(id, {
      include: [
        { model: db.GuestDirectory },
        { model: db.BookingGuest },
        { model: db.BookingExtra, include: [{ model: db.Extra }] },
        { model: db.Pod },
      ],
    });

    // Send cancellation email if status changed to cancelled
    if (bookingStatus === "cancelled" && existingBooking.bookingStatus !== "cancelled") {
      emailService.sendBookingCancellation(
        updatedBooking,
        updatedBooking.GuestDirectory,
        updatedBooking.Pod
      ).catch((err) => {
        console.error(`Failed to send cancellation email: ${err.message}`);
      });
    }

    res.json({
      success: true,
      message: "Booking updated successfully",
      booking: updatedBooking,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBooking,
  listBookings,
  getBookingDetails,
  findBooking,
  updateBooking,
};
