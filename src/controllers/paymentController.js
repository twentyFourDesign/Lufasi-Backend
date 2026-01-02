
const db = require("../models");
const paymentConfig = require("../config/paymentConfig");
const paystackService = require("../services/paystackService");
const squadcoService = require("../services/squadcoService");
const emailService = require("../services/emailService");

async function initializePayment(req, res, next) {
  try {
    const { bookingId } = req.body;
    let { gateway } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const validGateways = ["paystack", "squadco"];
    if (!gateway || !validGateways.includes(gateway)) {
      gateway = "paystack";
    }

    const bookingExpirationService = require("../services/bookingExpirationService");
    const booking = await bookingExpirationService.checkAndExpireBooking(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.bookingStatus === "expired") {
      return res.status(410).json({
        error: "Booking has expired",
        message: "This booking has expired due to non-payment. Please create a new booking.",
      });
    }

    if (booking.bookingStatus === "confirmed") {
      return res.status(400).json({ error: "Booking is already paid" });
    }

    if (booking.bookingStatus === "cancelled") {
      return res.status(400).json({ error: "Booking has been cancelled" });
    }

    // Load guest info if not included
    if (!booking.GuestDirectory) {
      await booking.reload({ include: [db.GuestDirectory] });
    }

    // Check for existing successful payment (idempotency)
    // CRITICAL: Check if ANY successful payment exists for this booking (regardless of gateway)
    // This prevents duplicate payments when user changes gateway parameter
    const anySuccessfulPayment = await db.BookingPayment.findOne({
      where: {
        bookingId: booking.id,
        paymentStatus: "success",
      },
    });

    if (anySuccessfulPayment) {
      return res.status(400).json({
        error: "Payment already completed",
        message: "A successful payment already exists for this booking.",
        bookingReference: booking.bookingReference,
        gateway: anySuccessfulPayment.gateway,
      });
    }

    // Check for existing initiated payment with same gateway
    const existingPayment = await db.BookingPayment.findOne({
      where: {
        bookingId: booking.id,
        paymentStatus: "initiated",
        gateway: gateway,
      },
    });

    // If there's an existing initiated payment with same gateway, verify and potentially reuse
    if (existingPayment) {
      let verifyResult;
      if (gateway === "paystack") {
        verifyResult = await paystackService.verifyTransaction(existingPayment.transactionReference);
      } else {
        verifyResult = await squadcoService.verifyTransaction(existingPayment.transactionReference);
      }

      // If already successful, update and return
      if (verifyResult.success && verifyResult.status === "success") {
        await handleSuccessfulPayment(booking, existingPayment, verifyResult);
        return res.json({
          success: true,
          message: "Payment was already completed",
          status: "paid",
          bookingReference: booking.bookingReference,
        });
      }

      // If still pending, return existing payment URL (if available)
      if (verifyResult.success && verifyResult.status === "pending" && existingPayment.gatewayReference) {
        // Return existing payment info so client can continue
        return res.json({
          success: true,
          message: "Existing payment session found",
          reference: existingPayment.transactionReference,
          gateway: gateway,
          amount: parseFloat(existingPayment.amount),
        });
      }
    }

    const otherGatewayPayment = await db.BookingPayment.findOne({
      where: {
        bookingId: booking.id,
        paymentStatus: "initiated",
        gateway: { [db.Sequelize.Op.ne]: gateway },
      },
    });

    if (otherGatewayPayment) {

      let verifyResult;
      if (otherGatewayPayment.gateway === "paystack") {
        verifyResult = await paystackService.verifyTransaction(otherGatewayPayment.transactionReference);
      } else {
        verifyResult = await squadcoService.verifyTransaction(otherGatewayPayment.transactionReference);
      }

      // If the other payment was successful, prevent new payment
      if (verifyResult.success && verifyResult.status === "success") {
        await handleSuccessfulPayment(booking, otherGatewayPayment, verifyResult);
        return res.status(400).json({
          error: "Payment already completed",
          message: `Payment was already completed via ${otherGatewayPayment.gateway}`,
          bookingReference: booking.bookingReference,
          gateway: otherGatewayPayment.gateway,
        });
      }

      // If still pending on other gateway, warn user but allow switching
      if (verifyResult.success && verifyResult.status === "pending") {
        // Mark the old payment as cancelled since user is switching gateways
        await otherGatewayPayment.update({
          paymentStatus: "cancelled",
          notes: `User switched from ${otherGatewayPayment.gateway} to ${gateway}`
        });
      }
    }

    // Extend expiration if booking was in failed state (allow retry)
    if (booking.bookingStatus === "failed") {
      await bookingExpirationService.extendExpiration(bookingId);
      await booking.update({ bookingStatus: "pending" });
    }

    // Generate unique reference
    const reference = paymentConfig.generateReference("LUF");
    const amount = parseFloat(booking.totalPrice);
    const email = booking.GuestDirectory.email;
    const customerName = booking.GuestDirectory.fullName;

    // Initialize with selected gateway
    let result;
    if (gateway === "paystack") {
      result = await paystackService.initializeTransaction({
        email,
        amount,
        reference,
        metadata: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          customerName,
        },
      });
    } else {
      result = await squadcoService.initializeTransaction({
        email,
        amount,
        reference,
        customerName,
        metadata: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
        },
      });
    }

    if (!result.success) {
      return res.status(500).json({
        error: "Failed to initialize payment",
        message: result.message,
      });
    }

    // Create payment record
    await db.BookingPayment.create({
      bookingId: booking.id,
      amount: amount,
      paymentMethod: gateway,
      paymentStatus: "initiated",
      transactionReference: reference,
      gateway: gateway,
      gatewayReference: result.accessCode || result.merchantTransactionRef || null,
    });

    // Log the action
    await db.BookingLog.create({
      bookingId: booking.id,
      action: `Payment initialized via ${gateway}`,
      newStatus: booking.bookingStatus,
    });

    res.json({
      success: true,
      paymentUrl: result.authorizationUrl,
      reference: reference,
      gateway: gateway,
      amount: amount,
    });
  } catch (err) {
    next(err);
  }
}


async function verifyPayment(req, res, next) {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ error: "Reference is required" });
    }

    const payment = await db.BookingPayment.findOne({
      where: { transactionReference: reference },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Verify with appropriate gateway
    let verifyResult;
    if (payment.gateway === "paystack") {
      verifyResult = await paystackService.verifyTransaction(reference);
    } else if (payment.gateway === "squadco") {
      verifyResult = await squadcoService.verifyTransaction(reference);
    } else {
      // Mock payment - just return current status
      const booking = await db.Booking.findByPk(payment.bookingId);
      return res.json({
        success: true,
        status: payment.paymentStatus,
        booking: booking,
        payment: payment,
      });
    }

    if (!verifyResult.success) {
      return res.status(500).json({
        error: "Verification failed",
        message: verifyResult.message,
      });
    }

    // Get booking
    const booking = await db.Booking.findByPk(payment.bookingId, {
      include: [db.GuestDirectory, db.BookingGuest],
    });

    // Update payment and booking based on verification result
    if (verifyResult.status === "success" && payment.paymentStatus !== "successful") {
      await handleSuccessfulPayment(booking, payment, verifyResult);
    } else if (verifyResult.status === "failed" && payment.paymentStatus !== "failed") {
      await handleFailedPayment(booking, payment, verifyResult);
    } else if (verifyResult.status === "abandoned" && payment.paymentStatus !== "abandoned") {
      await payment.update({
        paymentStatus: "abandoned",
        gatewayResponse: verifyResult.rawData,
      });
    }

    // Refresh data
    await payment.reload();
    await booking.reload();

    res.json({
      success: true,
      status: verifyResult.status,
      paymentStatus: payment.paymentStatus,
      bookingStatus: booking.bookingStatus,
      booking: booking,
      payment: payment,
    });
  } catch (err) {
    next(err);
  }
}

async function handlePaystackWebhook(req, res, next) {
  try {

    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      console.warn("Paystack webhook: Missing signature");
      return res.status(400).json({ error: "Missing signature" });
    }

    const rawBody = JSON.stringify(req.body);

    if (!paystackService.verifyWebhookSignature(signature, rawBody)) {
      console.warn("Paystack webhook: Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse webhook event
    const event = paystackService.parseWebhookEvent(req.body);
    console.log(`Paystack webhook received: ${event.event} for ${event.reference}`);

    // Find payment record
    const payment = await db.BookingPayment.findOne({
      where: { transactionReference: event.reference },
    });

    if (!payment) {
      console.warn(`Paystack webhook: Payment not found for reference ${event.reference}`);
      // Return 200 to acknowledge receipt (Paystack will retry otherwise)
      return res.status(200).json({ received: true, message: "Payment not found" });
    }

    // Idempotency check - if already processed, skip
    if (payment.webhookProcessedAt) {
      console.log(`Paystack webhook: Already processed for ${event.reference} at ${payment.webhookProcessedAt}`);
      return res.status(200).json({ received: true, message: "Already processed" });
    }

    // Get booking
    const booking = await db.Booking.findByPk(payment.bookingId, {
      include: [db.GuestDirectory],
    });

    // Handle different events
    switch (event.event) {
      case "charge.success":
        if (payment.paymentStatus !== "successful") {
          await handleSuccessfulPayment(booking, payment, {
            status: "success",
            paidAt: event.paidAt,
            rawData: event.rawData,
          });
        }
        break;

      case "charge.failed":
        if (payment.paymentStatus !== "failed") {
          await handleFailedPayment(booking, payment, {
            status: "failed",
            rawData: event.rawData,
          });
        }
        break;

      default:
        console.log(`Paystack webhook: Unhandled event ${event.event}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Paystack webhook error:", err);
    // Return 200 to prevent retries for server errors
    res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * Handle SquadCo webhook
 * POST /payments/webhook/squadco
 */
async function handleSquadcoWebhook(req, res, next) {
  try {
    // Get signature from header
    const signature = req.headers["x-squad-encrypted-body"] || req.headers["x-squad-signature"];

    if (!signature) {
      console.warn("SquadCo webhook: Missing signature");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);

    // Verify signature
    if (!squadcoService.verifyWebhookSignature(signature, rawBody)) {
      console.warn("SquadCo webhook: Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse webhook event
    const event = squadcoService.parseWebhookEvent(req.body);
    console.log(`SquadCo webhook received: ${event.event} for ${event.reference}`);

    // Find payment record
    const payment = await db.BookingPayment.findOne({
      where: { transactionReference: event.reference },
    });

    if (!payment) {
      console.warn(`SquadCo webhook: Payment not found for reference ${event.reference}`);
      return res.status(200).json({ received: true, message: "Payment not found" });
    }

    // Idempotency check - if already processed, skip
    if (payment.webhookProcessedAt) {
      console.log(`SquadCo webhook: Already processed for ${event.reference} at ${payment.webhookProcessedAt}`);
      return res.status(200).json({ received: true, message: "Already processed" });
    }

    // Get booking
    const booking = await db.Booking.findByPk(payment.bookingId, {
      include: [db.GuestDirectory],
    });

    // Handle different events
    switch (event.event) {
      case "charge.success":
        if (payment.paymentStatus !== "successful") {
          await handleSuccessfulPayment(booking, payment, {
            status: "success",
            paidAt: event.paidAt,
            rawData: event.rawData,
          });
        }
        break;

      case "charge.failed":
        if (payment.paymentStatus !== "failed") {
          await handleFailedPayment(booking, payment, {
            status: "failed",
            rawData: event.rawData,
          });
        }
        break;

      default:
        console.log(`SquadCo webhook: Unhandled event ${event.event}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("SquadCo webhook error:", err);
    res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * Helper: Handle successful payment
 */
async function handleSuccessfulPayment(booking, payment, verifyResult) {
  // Update payment record with idempotency marker
  await payment.update({
    paymentStatus: "successful",
    paidAt: verifyResult.paidAt || new Date(),
    gatewayResponse: verifyResult.rawData,
    webhookProcessedAt: new Date(),
  });

  // Update booking status to confirmed and clear expiration
  await booking.update({
    bookingStatus: "confirmed",
    expiresAt: null  // Clear expiration once payment is successful
  });

  // Create payment record for admin tracking
  await db.Payment.create({
    bookingReference: booking.bookingReference,
    guestName: booking.GuestDirectory?.fullName || "Guest",
    amount: booking.totalPrice,
    status: "paid",
  });

  // Log the action
  await db.BookingLog.create({
    bookingId: booking.id,
    action: `Payment successful via ${payment.gateway}`,
    oldStatus: "pending",
    newStatus: "confirmed",
  });

  // Get pod info for confirmation email
  const pod = await db.Pod.findByPk(booking.podId);

  // Send booking confirmation email (only after payment success)
  if (booking.GuestDirectory) {
    emailService.sendBookingConfirmation(booking, booking.GuestDirectory, pod)
      .then((result) => {
        if (result.success) {
          console.log(`Booking confirmation email sent for ${booking.bookingReference}`);
        }
      })
      .catch((err) => {
        console.error(`Failed to send booking confirmation email: ${err.message}`);
      });

    // Also send payment success email
    emailService.sendPaymentSuccess(booking, booking.GuestDirectory, payment)
      .then((result) => {
        if (result.success) {
          console.log(`Payment success email sent for ${booking.bookingReference}`);
        }
      })
      .catch((err) => {
        console.error(`Failed to send payment success email: ${err.message}`);
      });

    // Send admin alert about new booking
    emailService.sendAdminBookingAlert(booking, booking.GuestDirectory, pod)
      .then((result) => {
        if (result.success) {
          console.log(`Admin booking alert sent for ${booking.bookingReference}`);
        }
      })
      .catch((err) => {
        console.error(`Failed to send admin booking alert: ${err.message}`);
      });
  }


}

/**
 * Helper: Handle failed payment
 */
async function handleFailedPayment(booking, payment, verifyResult) {
  // Update payment record with idempotency marker
  // NOTE: We do NOT update booking status to 'failed' - it stays 'pending'
  // This allows users to retry payment with same or different gateway
  await payment.update({
    paymentStatus: "failed",
    gatewayResponse: verifyResult.rawData,
    webhookProcessedAt: new Date(),
  });

  // Log the action (booking status stays pending)
  await db.BookingLog.create({
    bookingId: booking.id,
    action: `Payment failed via ${payment.gateway} - booking remains pending for retry`,
    oldStatus: booking.bookingStatus,
    newStatus: booking.bookingStatus, // Status unchanged
  });

  // Send payment failed email with retry option
  if (booking.GuestDirectory) {
    emailService.sendPaymentFailed(booking, booking.GuestDirectory)
      .catch((err) => {
        console.error(`Failed to send payment failed email: ${err.message}`);
      });
  }

}

/**
 * Mock payment success (for development/testing)
 * GET /payments/mock-success
 */
async function mockSuccess(req, res, next) {
  try {
    const { txRef, bookingId } = req.query;
    const payment = await db.BookingPayment.findOne({
      where: { transactionReference: txRef },
    });
    if (!payment) return res.status(404).send("Payment not found");

    await payment.update({
      paymentStatus: "successful",
      paidAt: new Date(),
      gateway: "mock",
    });

    const booking = await db.Booking.findByPk(bookingId, {
      include: [db.GuestDirectory],
    });
    await booking.update({ bookingStatus: "paid" });

    await db.Payment.create({
      bookingReference: booking.bookingReference,
      guestName: booking.GuestDirectory?.fullName || "Guest",
      amount: booking.totalPrice,
      status: "paid",
    });

    await db.BookingLog.create({
      bookingId: booking.id,
      action: "Payment successful (mock)",
      oldStatus: "pending",
      newStatus: "paid",
    });

    res.send("Payment mocked as successful. You can close this page.");
  } catch (err) {
    next(err);
  }
}


async function initiatePayment(req, res, next) {
  // Redirect to new initialize endpoint
  req.body.gateway = req.body.gateway || "paystack";
  return initializePayment(req, res, next);
}


async function initializePaymentGet(req, res, next) {
  try {
    const { bookingId } = req.query;
    let { gateway } = req.query;

    if (!bookingId) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Error</h2>
            <p>Missing bookingId parameter</p>
            <p><a href="/">Go Back</a></p>
          </body>
        </html>
      `);
    }

    // Validate and default gateway
    const validGateways = ["paystack", "squadco"];
    const selectedGateway = validGateways.includes(gateway) ? gateway : "paystack";

    // Check booking expiration first
    const bookingExpirationService = require("../services/bookingExpirationService");
    const booking = await bookingExpirationService.checkAndExpireBooking(bookingId);

    if (!booking) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Booking Not Found</h2>
            <p>The booking ID provided is invalid.</p>
          </body>
        </html>
      `);
    }

    // Load guest info if not included
    if (!booking.GuestDirectory) {
      await booking.reload({ include: [db.GuestDirectory] });
    }

    if (booking.bookingStatus === "confirmed") {
      return res.send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>✅ Already Paid</h2>
            <p>Booking Reference: <strong>${booking.bookingReference}</strong></p>
            <p>This booking has already been paid.</p>
          </body>
        </html>
      `);
    }

    if (booking.bookingStatus === "expired") {
      return res.status(410).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>⏰ Booking Expired</h2>
            <p>This booking has expired due to non-payment.</p>
            <p>Please create a new booking.</p>
          </body>
        </html>
      `);
    }

    if (booking.bookingStatus === "cancelled") {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Booking Cancelled</h2>
            <p>This booking has been cancelled.</p>
          </body>
        </html>
      `);
    }

    // Check for existing successful payment (idempotency)
    const successfulPayment = await db.BookingPayment.findOne({
      where: {
        bookingId: booking.id,
        paymentStatus: "successful",
      },
    });

    if (successfulPayment) {
      return res.send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>✅ Already Paid</h2>
            <p>Booking Reference: <strong>${booking.bookingReference}</strong></p>
            <p>A successful payment already exists for this booking.</p>
          </body>
        </html>
      `);
    }

    // Generate unique reference
    const reference = paymentConfig.generateReference("LUF");
    const amount = parseFloat(booking.totalPrice);
    const email = booking.GuestDirectory.email;
    const customerName = booking.GuestDirectory.fullName;

    // Initialize with selected gateway
    let result;
    if (selectedGateway === "paystack") {
      result = await paystackService.initializeTransaction({
        email,
        amount,
        reference,
        metadata: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          customerName,
        },
      });
    } else {
      result = await squadcoService.initializeTransaction({
        email,
        amount,
        reference,
        customerName,
        metadata: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
        },
      });
    }

    if (!result.success) {
      return res.status(500).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Payment Error</h2>
            <p>${result.message || "Failed to initialize payment"}</p>
            <p><a href="javascript:history.back()">Try Again</a></p>
          </body>
        </html>
      `);
    }

    // Create payment record
    await db.BookingPayment.create({
      bookingId: booking.id,
      amount: amount,
      paymentMethod: selectedGateway,
      paymentStatus: "initiated",
      transactionReference: reference,
      gateway: selectedGateway,
      gatewayReference: result.accessCode || result.merchantTransactionRef || null,
    });

    // Log the action
    await db.BookingLog.create({
      bookingId: booking.id,
      action: `Payment initialized via ${selectedGateway} (browser redirect)`,
      newStatus: booking.bookingStatus,
    });

    // Redirect to payment gateway
    res.redirect(result.authorizationUrl);
  } catch (err) {
    console.error("initializePaymentGet error:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h2>❌ Server Error</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }
}


/**
 * Check if booking is still valid for payment
 * Handles lazy expiration - if booking is expired, updates status
 * GET /payments/check-booking/:bookingId
 */
async function checkBookingForPayment(req, res, next) {
  try {
    const { bookingId } = req.params;
    const bookingExpirationService = require("../services/bookingExpirationService");

    const booking = await bookingExpirationService.checkAndExpireBooking(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.bookingStatus === "expired") {
      return res.status(410).json({
        error: "Booking has expired",
        message: "This booking has expired due to non-payment. Please create a new booking.",
        status: "expired"
      });
    }

    if (booking.bookingStatus === "paid" || booking.bookingStatus === "confirmed") {
      return res.json({
        success: true,
        message: "Booking is already paid",
        status: booking.bookingStatus,
        bookingReference: booking.bookingReference
      });
    }

    if (booking.bookingStatus === "failed") {
      // Allow retry for failed payments - extend expiration
      await bookingExpirationService.extendExpiration(bookingId);
      await booking.reload();
    }

    res.json({
      success: true,
      status: booking.bookingStatus,
      bookingReference: booking.bookingReference,
      expiresAt: booking.expiresAt,
      canPay: booking.bookingStatus === "pending" || booking.bookingStatus === "failed",
      totalPrice: booking.totalPrice
    });
  } catch (err) {
    next(err);
  }
}

async function handlePaymentCallback(req, res, next) {
  try {
    const { reference, trxref, status } = req.query;
    const txRef = reference || trxref;

    if (!txRef) {
      return res.status(400).json({
        success: false,
        error: "Missing payment reference"
      });
    }

    const payment = await db.BookingPayment.findOne({
      where: { transactionReference: txRef },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: "Payment not found",
        reference: txRef
      });
    }

    const booking = await db.Booking.findByPk(payment.bookingId, {
      include: [db.GuestDirectory, db.BookingGuest],
    });

    let verifyResult;
    if (payment.gateway === "paystack") {
      verifyResult = await paystackService.verifyTransaction(txRef);
    } else if (payment.gateway === "squadco") {
      verifyResult = await squadcoService.verifyTransaction(txRef);
    } else {
      verifyResult = { success: true, status: payment.paymentStatus };
    }

    if (verifyResult.success && verifyResult.status === "success" && payment.paymentStatus !== "successful") {
      await handleSuccessfulPayment(booking, payment, verifyResult);
      await payment.reload();
      await booking.reload();
    } else if (verifyResult.success && verifyResult.status === "failed" && payment.paymentStatus !== "failed") {
      await handleFailedPayment(booking, payment, verifyResult);
      await payment.reload();
      await booking.reload();
    }

    const isSuccess = payment.paymentStatus === "successful" || booking.bookingStatus === "confirmed" || booking.bookingStatus === "paid";
    const isFailed = payment.paymentStatus === "failed";

    if (isSuccess) {
      return res.json({
        success: true,
        message: "Payment successful",
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        amount: parseFloat(booking.totalPrice),
        paymentReference: payment.transactionReference,
        paymentStatus: payment.paymentStatus,
        bookingStatus: booking.bookingStatus,
        paidAt: payment.paidAt,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guest: {
          name: booking.GuestDirectory?.fullName,
          email: booking.GuestDirectory?.email,
          phone: booking.GuestDirectory?.phone
        },
        guests: {
          adults: booking.BookingGuests?.[0]?.adults || 0,
          children: booking.BookingGuests?.[0]?.children || 0,
          infants: booking.BookingGuests?.[0]?.infants || 0
        },
        gateway: payment.gateway
      });
    } else if (isFailed) {
      return res.json({
        success: false,
        message: "Payment failed",
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        amount: parseFloat(booking.totalPrice),
        paymentReference: payment.transactionReference,
        paymentStatus: payment.paymentStatus,
        bookingStatus: booking.bookingStatus
      });
    } else {
      return res.json({
        success: false,
        message: "Payment processing",
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        amount: parseFloat(booking.totalPrice),
        paymentReference: payment.transactionReference,
        paymentStatus: payment.paymentStatus,
        bookingStatus: booking.bookingStatus
      });
    }
  } catch (err) {
    console.error("handlePaymentCallback error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

async function payWithToken(req, res, next) {
  try {
    const { token } = req.params;
    // Accept gateway from body (POST) or query (GET fallback)
    let { gateway } = req.body || {};
    if (!gateway) {
      gateway = req.query.gateway;
    }

    if (!token || token.length !== 64) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Invalid Link</h2>
            <p>The payment link is invalid or malformed.</p>
          </body>
        </html>
      `);
    }

    // Find payment token
    const paymentToken = await db.PaymentToken.findOne({
      where: { token: token },
    });

    if (!paymentToken) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Link Not Found</h2>
            <p>This payment link does not exist or has already been used.</p>
          </body>
        </html>
      `);
    }

    // Check token expiry
    if (new Date(paymentToken.expiresAt) < new Date()) {
      return res.status(410).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>⏰ Link Expired</h2>
            <p>This payment link has expired.</p>
            <p>Please create a new booking.</p>
          </body>
        </html>
      `);
    }

    // Resolve bookingId internally (never exposed to client)
    const bookingId = paymentToken.bookingId;

    // Validate and default gateway
    const validGateways = ["paystack", "squadco"];
    const selectedGateway = validGateways.includes(gateway) ? gateway : "paystack";

    // Check booking expiration using internal bookingId
    const bookingExpirationService = require("../services/bookingExpirationService");
    const booking = await bookingExpirationService.checkAndExpireBooking(bookingId);

    if (!booking) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Booking Not Found</h2>
            <p>The associated booking could not be found.</p>
          </body>
        </html>
      `);
    }

    // Load guest info if not included
    if (!booking.GuestDirectory) {
      await booking.reload({ include: [db.GuestDirectory] });
    }

    if (booking.bookingStatus === "confirmed") {
      return res.send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>✅ Already Paid</h2>
            <p>Booking Reference: <strong>${booking.bookingReference}</strong></p>
            <p>This booking has already been paid.</p>
          </body>
        </html>
      `);
    }

    if (booking.bookingStatus === "expired") {
      // Update token expiry to match
      await paymentToken.update({ expiresAt: new Date() });
      return res.status(410).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>⏰ Booking Expired</h2>
            <p>This booking has expired due to non-payment.</p>
            <p>Please create a new booking.</p>
          </body>
        </html>
      `);
    }

    if (booking.bookingStatus === "cancelled") {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Booking Cancelled</h2>
            <p>This booking has been cancelled.</p>
          </body>
        </html>
      `);
    }

    // Check for existing successful payment (anti-duplication)
    const successfulPayment = await db.BookingPayment.findOne({
      where: {
        bookingId: booking.id,
        paymentStatus: "successful",
      },
    });

    if (successfulPayment) {
      return res.send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>✅ Already Paid</h2>
            <p>Booking Reference: <strong>${booking.bookingReference}</strong></p>
            <p>A successful payment already exists for this booking.</p>
          </body>
        </html>
      `);
    }

    // Mark token as used (but allow retries for failed payments)
    if (!paymentToken.usedAt) {
      await paymentToken.update({ usedAt: new Date() });
    }

    // Generate unique reference
    const reference = paymentConfig.generateReference("LUF");
    const amount = parseFloat(booking.totalPrice);
    const email = booking.GuestDirectory.email;
    const customerName = booking.GuestDirectory.fullName;

    // Initialize with selected gateway
    let result;
    if (selectedGateway === "paystack") {
      result = await paystackService.initializeTransaction({
        email,
        amount,
        reference,
        metadata: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          customerName,
        },
      });
    } else {
      result = await squadcoService.initializeTransaction({
        email,
        amount,
        reference,
        customerName,
        metadata: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
        },
      });
    }

    if (!result.success) {
      return res.status(500).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2>❌ Payment Error</h2>
            <p>${result.message || "Failed to initialize payment"}</p>
            <p><a href="javascript:history.back()">Try Again</a></p>
          </body>
        </html>
      `);
    }

    // Create payment record
    await db.BookingPayment.create({
      bookingId: booking.id,
      amount: amount,
      paymentMethod: selectedGateway,
      paymentStatus: "initiated",
      transactionReference: reference,
      gateway: selectedGateway,
      gatewayReference: result.accessCode || result.merchantTransactionRef || null,
    });

    // Log the action
    await db.BookingLog.create({
      bookingId: booking.id,
      action: `Payment initialized via ${selectedGateway} (token-based)`,
      newStatus: booking.bookingStatus,
    });

    // Redirect to payment gateway
    res.redirect(result.authorizationUrl);
  } catch (err) {
    console.error("payWithToken error:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h2>❌ Server Error</h2>
          <p>An unexpected error occurred. Please try again later.</p>
        </body>
      </html>
    `);
  }
}

module.exports = {
  initializePayment,
  initializePaymentGet,
  verifyPayment,
  handlePaystackWebhook,
  handleSquadcoWebhook,
  handlePaymentCallback,
  mockSuccess,
  initiatePayment,
  checkBookingForPayment,
  payWithToken,
};
