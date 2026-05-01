const crypto = require("crypto");
const db = require("../models");
const { v4: uuidv4 } = require("uuid");
const { priceCalculator } = require("../utils/priceCalculator");
const emailService = require("../services/emailService");
const uploadService = require("../services/uploadService");

// Helper to generate booking reference
function genRef() {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `LUF-${random}`;
}

async function getPricingConfigOrDefault() {
  const config = await db.PricingConfiguration.findByPk(1);
  if (!config) {
    return {
      id: 1,
      basePricePerPod: 400000,
      extraGuestFee: 100000,
      maxGuestsPerPod: 2,
      minGuestsPerPod: 1,
      totalPodsAvailable: 6,
      twelveGuestDiscountPercent: 10,
      currency: "NGN",
    };
  }
  return config;
}

function calculateBaseAndExtraForStay({
  guestsCount,
  podsCount,
  nights,
  config,
}) {
  const totalGuests = guestsCount < 1 ? 1 : guestsCount;
  const pods = podsCount < 1 ? 1 : podsCount;

  const basePricePerPod = Number(config.basePricePerPod || 400000);
  const extraGuestFee = Number(config.extraGuestFee || 100000);

  const basePerNight = pods * basePricePerPod;
  const extraGuests = totalGuests > pods ? totalGuests - pods : 0;
  const extraPerNight = extraGuests * extraGuestFee;

  const baseForStay = basePerNight * nights;
  const extraForStay = extraPerNight * nights;

  return {
    baseForStay,
    extraForStay,
    extraGuests,
  };
}

async function hasPodCapacity({ checkIn, checkOut, podsRequested, config }) {
  const totalPodsAvailable = config.totalPodsAvailable || 6;

  const start = new Date(checkIn);
  const end = new Date(checkOut);

  if (!(start instanceof Date) || !(end instanceof Date) || !(start < end)) {
    return false;
  }

  const bookings = await db.Booking.findAll({
    where: {
      bookingStatus: {
        [db.Sequelize.Op.in]: [
          "pending",
          "paid",
          "confirmed",
          "confirmed_unassigned",
          "ready_for_checkin",
        ],
      },
      checkIn: { [db.Sequelize.Op.lt]: end },
      checkOut: { [db.Sequelize.Op.gt]: start },
    },
  });

  const usedPods = bookings.reduce((sum, b) => {
    const podsCount = b.podsCount || b.podCount || 1;
    return sum + podsCount;
  }, 0);

  return usedPods + podsRequested <= totalPodsAvailable;
}

// Create booking (public)
async function createBooking(req, res, next) {
  try {
    console.log("[createBooking] Incoming booking request", {
      hasPayloadField: !!req.body?.payload,
      hasFile: !!req.file,
      fileInfo: req.file
        ? {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path,
        }
        : null,
    });

    let payload = req.body;
    if (req.body && req.body.payload) {
      try {
        payload = JSON.parse(req.body.payload);
      } catch (e) {
        return res
          .status(400)
          .json({ error: "Invalid payload format. Expected JSON string." });
      }
    }

    const {
      dates,
      contact,
      podId,
      boardType = "fullBoard",
      guests,
      popUpBeds = 0,
      extras = [],
      discountCode,
      voucherCode,
      podCount,
      domeDetails = [],
      welcomeNote = null,
    } = payload;
    const bookingData = {
      podId: podId,
      checkIn: dates?.checkIn,
      checkOut: dates?.checkOut,
      boardType: boardType,
      guests: {
        adults: guests?.adults || 0,
        children: guests?.children || 0,
        toddlers: 0,
        infants: 0,
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
      podCount: Number(podCount) || 1,
      domeDetails,
      welcomeNote,
    };

    // Basic validations
    if (
      !bookingData.contact ||
      !bookingData.contact.email ||
      bookingData.podCount < 1 ||
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

    // Age Verification (18+)
    if (bookingData.contact && bookingData.contact.dateOfBirth) {
      const dob = new Date(bookingData.contact.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 18) {
        return res.status(400).json({
          error: "The primary guest must be at least 18 years old.",
        });
      }
    } else {
      // If dateOfBirth is mandatory, you can enforce it here.
      // Assuming it's required as per "check that the booking guest is atleast 18"
      return res.status(400).json({
        error: "Date of birth is required for the primary guest.",
      });
    }

    if (bookingData.boardType !== "fullBoard") {
      return res.status(400).json({
        error: "Pods are now exclusively available on a Full Board basis.",
      });
    }

    const pricingConfig = await getPricingConfigOrDefault();

    const checkInDate = new Date(bookingData.checkIn);
    const checkOutDate = new Date(bookingData.checkOut);
    let nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (!Number.isFinite(nights) || nights < 1) {
      nights = 1;
    }

    const guestCounts = bookingData.guests || {};
    const totalGuests =
      (guestCounts.adults || 0) +
      (guestCounts.children || 0);
    const podsRequested = bookingData.podCount || 1;

    if (totalGuests < podsRequested) {
      return res.status(400).json({
        error: "Guests count must be at least equal to pods count.",
      });
    }

    if (totalGuests > podsRequested * (pricingConfig.maxGuestsPerPod || 2)) {
      return res.status(400).json({
        error:
          "Guests count exceeds maximum allowed for the requested number of pods.",
      });
    }

    if (totalGuests < (pricingConfig.minGuestsPerPod || 1)) {
      return res.status(400).json({
        error: "Guests count is below the minimum allowed per booking.",
      });
    }

    if (podsRequested > (pricingConfig.totalPodsAvailable || 6)) {
      return res.status(400).json({
        error: "Requested pods count exceeds total pods available.",
      });
    }

    const capacityOk = await hasPodCapacity({
      checkIn: bookingData.checkIn,
      checkOut: bookingData.checkOut,
      podsRequested,
      config: pricingConfig,
    });

    if (!capacityOk) {
      return res.status(400).json({
        error: "Not enough pods available for the selected dates.",
      });
    }

    // Explicitly check if the requested pod is blocked or booked
    const datesArr = [];
    for (let d = new Date(bookingData.checkIn); d < new Date(bookingData.checkOut); d.setDate(d.getDate() + 1)) {
        datesArr.push(new Date(d).toISOString().slice(0, 10));
    }
    const podConflict = await db.CalendarAvailability.findOne({
        where: {
            podId: bookingData.podId,
            date: { [db.Sequelize.Op.in]: datesArr },
            status: { [db.Sequelize.Op.in]: ["booked", "blocked"] }
        }
    });
    if (podConflict) {
        return res.status(400).json({
            error: "The selected room is unavailable or has been blocked for the selected dates.",
        });
    }

    const { baseForStay, extraForStay, extraGuests } =
      calculateBaseAndExtraForStay({
        guestsCount: totalGuests,
        podsCount: podsRequested,
        nights,
        config: pricingConfig,
      });

    let calculatedTotal = baseForStay + extraForStay;

    let twelveGuestDiscountApplied = false;
    let twelveGuestDiscountAmount = 0;

    if (totalGuests === 12) {
      const configuredDiscountPercent =
        pricingConfig.twelveGuestDiscountPercent != null
          ? Number(pricingConfig.twelveGuestDiscountPercent)
          : 10;
      const percentAsDecimal = configuredDiscountPercent / 100;
      twelveGuestDiscountApplied = true;
      twelveGuestDiscountAmount = Number(
        (Number(baseForStay) * percentAsDecimal).toFixed(2),
      );
      calculatedTotal = calculatedTotal - twelveGuestDiscountAmount;
    }

    // --- APPLY DISCOUNT CODE ---
    let appliedDiscountId = null;
    let discountAmount = 0;
    if (discountCode) {
      const d = await db.Discount.findOne({
        where: { code: discountCode.toUpperCase() },
      });
      if (d) {
        const today = new Date().toISOString().split("T")[0];
        const isNotStarted = d.startDate && today < d.startDate;
        const isExpired = d.endDate && today > d.endDate;
        const limitReached = d.maxUses > 0 && d.usedCount >= d.maxUses;

        if (!isNotStarted && !isExpired && !limitReached) {
          appliedDiscountId = d.id;
          if (d.type === "percentage") {
            discountAmount = Math.round(calculatedTotal * (Number(d.value) / 100));
          } else {
            discountAmount = Number(d.value);
          }
          calculatedTotal -= discountAmount;
          // Note: usedCount increment should ideally happen after payment, 
          // but for simplicity we can track it here or in payment confirmation.
        }
      }
    }

    // --- APPLY VOUCHER CODE ---
    let appliedVoucherId = null;
    let voucherAmount = 0;
    if (voucherCode) {
      const v = await db.Voucher.findOne({
        where: { code: voucherCode.toUpperCase() },
      });
      if (v) {
        const today = new Date().toISOString().split("T")[0];
        const isNotStarted = v.validFrom && today < v.validFrom;
        const isExpired = v.validTo && today > v.validTo;
        const limitReached = v.maxUses > 0 && v.usedCount >= v.maxUses;

        if (!isNotStarted && !isExpired && !limitReached) {
          appliedVoucherId = v.id;
          voucherAmount = Number(v.value);
          calculatedTotal -= voucherAmount;
        }
      }
    }

    // Calculate complete price BEFORE voucher/discounts but including room and extras
    const preVoucherTotal = calculatedTotal;
    const amountBeforeVoucher = Math.max(0, preVoucherTotal) * 1.125;

    const totalBeforeTax = Math.max(0, calculatedTotal);
    const totalPrice = totalBeforeTax * 1.125;

    const pricingBreakdown = {
      baseRate: Number(pricingConfig.basePricePerPod),
      podCount: podsRequested,
      basePodsCost: baseForStay,
      extra_guest_charges:
        extraGuests > 0
          ? [
            {
              guests: extraGuests,
              unitPrice: Number(pricingConfig.extraGuestFee),
              total: extraForStay,
            },
          ]
          : [],
      meal_plan: {
        type: "Full Board",
        cost: 0,
        status: "MANDATORY",
      },
      twelve_guest_discount: {
        applied: twelveGuestDiscountApplied,
        percent:
          pricingConfig.twelveGuestDiscountPercent != null
            ? Number(pricingConfig.twelveGuestDiscountPercent)
            : 10,
        amount: twelveGuestDiscountAmount,
      },
      applied_discount: appliedDiscountId ? {
        code: discountCode.toUpperCase(),
        amount: discountAmount
      } : null,
      applied_voucher: appliedVoucherId ? {
        code: voucherCode.toUpperCase(),
        amount: voucherAmount
      } : null
    };

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

    let identificationImageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadService.uploadToCloudinary(
          req.file.path,
          {
            folder: "lufasi/identifications",
            resource_type: "auto",
          },
        );
        identificationImageUrl = uploadResult.secure_url || uploadResult.url;
        console.log("[createBooking] Identification uploaded to Cloudinary", {
          identificationImageUrl,
          public_id: uploadResult.public_id,
        });
      } catch (err) {
        console.error(
          "Failed to upload identification document to Cloudinary:",
          err,
        );
      }
    }

    const booking = await db.Booking.create({
      bookingReference: bookingRef,
      guestDirectoryId: guestDir.id,
      podId: bookingData.podId,
      checkIn: bookingData.checkIn,
      checkOut: bookingData.checkOut,
      totalPrice,
      bookingStatus: "pending",
      boardType: bookingData.boardType || "fullBoard",
      popUpBeds: bookingData.popUpBeds,
      podCount: bookingData.podCount,
      guestsCount: totalGuests,
      podsCount: podsRequested,
      priceSnapshotBase: baseForStay,
      priceSnapshotExtra: extraForStay,
      identificationImageUrl,
      calculatedTotal,
      configBasePricePerPod: Number(pricingConfig.basePricePerPod),
      configExtraGuestFee: Number(pricingConfig.extraGuestFee),
      configMaxGuestsPerPod: pricingConfig.maxGuestsPerPod,
      configMinGuestsPerPod: pricingConfig.minGuestsPerPod,
      configTotalPodsAvailable: pricingConfig.totalPodsAvailable,
      configCurrency: pricingConfig.currency,
      bedConfiguration: bookingData.bedConfiguration,
      twelveGuestDiscountApplied,
      twelveGuestDiscountAmount,
      domeDetails: bookingData.domeDetails,
      welcomeNote: bookingData.welcomeNote,
      expiresAt: expiresAt,
      discountId: appliedDiscountId,
      voucherId: appliedVoucherId,
    });

    console.log("[createBooking] Booking created", {
      bookingId: booking.id,
      bookingReference: bookingRef,
      identificationImageUrl,
    });

    // booking guests
    await db.BookingGuest.create({
      bookingId: booking.id,
      adults: bookingData.guests.adults || 0,
      children: bookingData.guests.children || 0,
      toddlers: bookingData.guests.toddlers || 0,
      infants: 0,
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

    // If voucher was applied, record it as a payment
    if (appliedVoucherId) {
      // The voucher covers its value or up to the pre-voucher total
      // We record the amount that was subtracted
      // Capping voucher payment amount at what it actually covered
      const cappedVoucherAmount = Math.min(voucherAmount, amountBeforeVoucher);
      await db.BookingPayment.create({
        bookingId: booking.id,
        amount: cappedVoucherAmount,
        paymentMethod: "voucher",
        paymentStatus: "successful",
        transactionReference: `VOUCH-${voucherCode.toUpperCase()}-${bookingRef}`,
        gateway: "mock",
        paidAt: new Date(),
        webhookProcessedAt: new Date(),
      });
    }

    if (totalPrice <= 0) {
      // Confirm immediately for zero-amount bookings
      await booking.update({ bookingStatus: "confirmed", expiresAt: null });

      // If no voucher was used but it's still 0 (e.g. 100% discount), create a FREE payment record
      // If a voucher was used, we already have a payment record above.
      let payment;
      if (!appliedVoucherId) {
        payment = await db.BookingPayment.create({
          bookingId: booking.id,
          amount: 0,
          paymentMethod: "discount_total",
          paymentStatus: "successful",
          transactionReference: `FREE-${bookingRef}`,
          gateway: "mock",
          paidAt: new Date(),
          webhookProcessedAt: new Date(),
        });
      } else {
        // Use the voucher payment we just created
        payment = await db.BookingPayment.findOne({
          where: { bookingId: booking.id, paymentMethod: "voucher" }
        });
      }

      // Attach guest info for handleSuccessfulPayment
      booking.GuestDirectory = guestDir;

      const paymentController = require("./paymentController");
      await paymentController.handleSuccessfulPayment(booking, payment, {
        status: "success",
        paidAt: new Date(),
        rawData: { note: "Zero amount booking" },
      });

      return res.json({
        bookingId: booking.id,
        bookingReference: bookingRef,
        amountDue: 0,
        paymentLink: null,
        room_type: podRecord.podName || "Luxury Pod",
        guests: totalGuests,
        pricing_breakdown: pricingBreakdown,
        total_amount: 0,
        isConfirmed: true,
      });
    }

    res.json({
      bookingId: booking.id,
      bookingReference: bookingRef,
      amountDue: totalPrice,
      paymentLink,
      room_type: podRecord.podName || "Luxury Pod",
      guests: totalGuests,
      pricing_breakdown: pricingBreakdown,
      total_amount: totalPrice,
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
        { model: db.Voucher },
        { model: db.BookingExtra, include: [{ model: db.Extra }] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const bookingsWithExtraData = bookings.map(b => {
      const bJSON = b.toJSON();
      
      // Calculate original total price (Room + Extras + 12.5% Tax)
      // Since totalPrice in DB is (Room - Discounts) * 1.125, we try to reconstruct original room + extras
      const extrasTotal = b.BookingExtras?.reduce((sum, be) => sum + parseFloat(be.totalPrice || 0), 0) || 0;
      const baseRoomTotal = (parseFloat(b.priceSnapshotBase || 0) + parseFloat(b.priceSnapshotExtra || 0));
      
      // The total original sticker price
      bJSON.fullBookingPrice = (baseRoomTotal + extrasTotal) * 1.125;
      
      return bJSON;
    });

    const blocks = await db.CalendarAvailability.findAll({
      where: { status: "blocked" },
    });

    res.json({ bookings: bookingsWithExtraData, blocks });
  } catch (err) {
    next(err);
  }
}

async function blockRoom(req, res, next) {
  try {
    const { podId, date } = req.body;
    if (!podId || !date) return res.status(400).json({ error: "podId and date required" });

    const existing = await db.CalendarAvailability.findOne({
      where: { podId, date }
    });

    if (existing && existing.status !== "blocked") {
      return res.status(400).json({ error: "Room is already booked on this date." });
    }

    if (!existing) {
      await db.CalendarAvailability.create({
        podId,
        date,
        status: "blocked",
        bookingId: null
      });
    }

    res.json({ success: true, message: "Room blocked successfully" });
  } catch (err) {
    next(err);
  }
}

async function unblockRoom(req, res, next) {
  try {
    const { podId, date } = req.body;
    if (!podId || !date) return res.status(400).json({ error: "podId and date required" });

    await db.CalendarAvailability.destroy({
      where: { podId, date, status: "blocked" }
    });

    res.json({ success: true, message: "Room unblocked successfully" });
  } catch (err) {
    next(err);
  }
}

async function getBookingDetails(req, res, next) {
  try {
    const booking = await db.Booking.findByPk(req.params.id, {
      include: [
        { model: db.GuestDirectory },
        { model: db.Pod },
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
              db.sequelize.col("GuestDirectory.fullName"),
            ),
            "LIKE",
            `%${lastName.toLowerCase()}%`,
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
      (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24),
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
        children: booking.BookingGuests?.[0]?.children || 0,
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
      podCount: booking.podCount || 0,

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
      welcomeNote: booking.welcomeNote,
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
          children: existingBooking.BookingGuests?.[0]?.children || 0,
        };

        const priceCalc = priceCalculator({
          pod: podRecord,
          boardType: boardType || existingBooking.boardType,
          guests: {
            adults: guestData.adults,
            children: guestData.children,
            toddlers: 0,
            infants: 0,
          },
          popUpBeds:
            popUpBeds !== undefined ? popUpBeds : existingBooking.popUpBeds,
          extras: extras,
          podPriceRules: podRecord.priceRules,
          pods: existingBooking.podCount || 1,
        });

        const checkIn =
          dates?.checkIn != null ? dates.checkIn : existingBooking.checkIn;
        const checkOut =
          dates?.checkOut != null ? dates.checkOut : existingBooking.checkOut;
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        let nights = Math.ceil(
          (checkOutDate.getTime() - checkInDate.getTime()) /
          (1000 * 60 * 60 * 24),
        );
        if (!Number.isFinite(nights) || nights < 1) {
          nights = 1;
        }

        const totalBeforeTax = priceCalc.total * nights;
        updateData.totalPrice = totalBeforeTax * 1.125;
      }
    }

    // IMPORTANT: Save the original status BEFORE update (Sequelize mutates the object)
    const originalBookingStatus = existingBooking.bookingStatus;

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
          children: guests.children || bookingGuest.children,
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
    if (
      bookingStatus === "cancelled" &&
      originalBookingStatus !== "cancelled"
    ) {
      emailService
        .sendBookingCancellation(
          updatedBooking,
          updatedBooking.GuestDirectory,
          updatedBooking.Pod,
        )
        .catch((err) => {
          console.error(`Failed to send cancellation email: ${err.message}`);
        });

      // Send admin alert about cancellation
      emailService
        .sendAdminCancellationAlert(
          updatedBooking,
          updatedBooking.GuestDirectory,
          updatedBooking.Pod,
        )
        .catch((err) => {
          console.error(
            `Failed to send admin cancellation alert: ${err.message}`,
          );
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
// Send email based on booking status (admin)
async function sendConfirmation(req, res, next) {
  try {
    const { id } = req.params;

    const booking = await db.Booking.findByPk(id, {
      include: [
        { model: db.GuestDirectory },
        { model: db.Pod },
        { model: db.BookingGuest },
      ],
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const guest = booking.GuestDirectory;
    if (!guest?.email) {
      return res.status(400).json({ error: "Guest email not available" });
    }

    // Send appropriate email based on booking status
    if (booking.bookingStatus === "cancelled") {
      await emailService.sendBookingCancellation(booking, guest, booking.Pod);
      res.json({
        success: true,
        message: "Cancellation email sent successfully",
      });
    } else {
      await emailService.sendBookingConfirmation(booking, guest, booking.Pod);
      res.json({
        success: true,
        message: "Confirmation email sent successfully",
      });
    }
  } catch (err) {
    next(err);
  }
}

// Resend invoice (admin)
async function resendInvoice(req, res, next) {
  try {
    const { id } = req.params;

    const booking = await db.Booking.findByPk(id, {
      include: [
        { model: db.GuestDirectory },
        { model: db.Pod },
        { model: db.BookingPayment },
      ],
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const guest = booking.GuestDirectory;
    if (!guest?.email) {
      return res.status(400).json({ error: "Guest email not available" });
    }

    // Send confirmation email (acts as invoice)
    await emailService.sendBookingConfirmation(booking, guest, booking.Pod);

    res.json({
      success: true,
      message: "Invoice resent successfully",
    });
  } catch (err) {
    next(err);
  }
}

async function allocatePod(req, res, next) {
  const t = await db.sequelize.transaction();
  try {
    const { id } = req.params;
    const { podIds } = req.body; // Expecting an array of pod IDs

    if (!podIds || !Array.isArray(podIds) || podIds.length === 0) {
      return res.status(400).json({ error: "At least one podId is required" });
    }

    const booking = await db.Booking.findByPk(id);
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    if (podIds.length !== booking.podCount) {
      await t.rollback();
      return res.status(400).json({
        error: `This booking requires exactly ${booking.podCount} pod(s). Provided: ${podIds.length}`,
      });
    }

    // Verify all pods exist
    const pods = await db.Pod.findAll({
      where: { id: { [db.Sequelize.Op.in]: podIds } },
      transaction: t,
    });

    if (pods.length !== podIds.length) {
      await t.rollback();
      return res.status(404).json({ error: "One or more pods not found" });
    }

    // Check availability for all selected pods
    const start = new Date(booking.checkIn);
    const end = new Date(booking.checkOut);
    const dates = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().slice(0, 10));
    }

    const existingOccupancy = await db.CalendarAvailability.findOne({
      where: {
        podId: { [db.Sequelize.Op.in]: podIds },
        date: { [db.Sequelize.Op.in]: dates },
        status: { [db.Sequelize.Op.in]: ["booked", "blocked"] },
        bookingId: { [db.Sequelize.Op.ne]: booking.id }, // exclude current booking
      },
      transaction: t,
    });

    if (existingOccupancy) {
      const occupiedPod = pods.find((p) => p.id === existingOccupancy.podId);
      await t.rollback();
      return res.status(400).json({
        error: `Pod "${occupiedPod?.podName}" is already booked for these dates`,
      });
    }

    const oldStatus = booking.bookingStatus;

    // Update booking - we store the first podId as primary (for backward compatibility/single pod bookings)
    // but the source of truth for multiple pods will be CalendarAvailability
    await booking.update(
      {
        podId: podIds[0],
        bookingStatus: "ready_for_checkin",
      },
      { transaction: t },
    );

    // Update CalendarAvailability
    // 1. Remove old records for this booking
    await db.CalendarAvailability.destroy({
      where: { bookingId: booking.id },
      transaction: t,
    });

    // 2. Create new records for all selected pods
    for (const podId of podIds) {
      for (const date of dates) {
        await db.CalendarAvailability.create(
          {
            podId,
            date,
            status: "booked",
            bookingId: booking.id,
          },
          { transaction: t },
        );
      }
    }

    // Log action
    const podNames = pods.map((p) => p.podName).join(", ");
    await db.BookingLog.create(
      {
        bookingId: booking.id,
        action: `Pods manually allocated: ${podNames}`,
        oldStatus,
        newStatus: "ready_for_checkin",
        userAgent: req.get("user-agent"),
        ipAddress: req.ip,
      },
      { transaction: t },
    );

    await t.commit();

    res.json({
      success: true,
      message: `${podIds.length} pod(s) allocated successfully: ${podNames}`,
      booking,
    });
  } catch (err) {
    if (t) await t.rollback();
    next(err);
  }
}

// Cancel booking (admin)
async function cancelBooking(req, res, next) {
  const t = await db.sequelize.transaction();
  try {
    const { id } = req.params;

    const booking = await db.Booking.findByPk(id, {
      include: [{ model: db.GuestDirectory }, { model: db.Pod }],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    const oldStatus = booking.bookingStatus;

    // Update status to cancelled
    await booking.update({ bookingStatus: "cancelled" }, { transaction: t });

    // Remove calendar availability entries to free up dates
    await db.CalendarAvailability.destroy({
      where: { bookingId: booking.id },
      transaction: t,
    });

    // Log the cancellation
    await db.BookingLog.create(
      {
        bookingId: booking.id,
        action: "Booking cancelled by Admin",
        oldStatus,
        newStatus: "cancelled",
        userAgent: req.get("user-agent"),
        ipAddress: req.ip,
      },
      { transaction: t },
    );

    await t.commit();

    // Send cancellation email asynchronously
    if (booking.GuestDirectory?.email) {
      emailService
        .sendBookingCancellation(booking, booking.GuestDirectory, booking.Pod)
        .catch((err) =>
          console.error(`Failed to send cancellation email: ${err.message}`),
        );

      // Send admin alert
      emailService
        .sendAdminCancellationAlert(
          booking,
          booking.GuestDirectory,
          booking.Pod,
        )
        .catch((err) =>
          console.error(
            `Failed to send admin cancellation alert: ${err.message}`,
          ),
        );
    }

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      booking,
    });
  } catch (err) {
    if (t) await t.rollback();
    next(err);
  }
}

module.exports = {
  createBooking,
  listBookings,
  getBookingDetails,
  findBooking,
  updateBooking,
  sendConfirmation,
  resendInvoice,
  allocatePod,
  cancelBooking,
  blockRoom,
  unblockRoom,
};
