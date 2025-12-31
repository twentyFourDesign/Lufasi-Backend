const express = require("express");
const router = express.Router();
const paymentCtrl = require("../controllers/paymentController");

// Check booking status before payment (handles expiration)
router.get("/check-booking/:bookingId", paymentCtrl.checkBookingForPayment);

// Token-based payment initiation (public, hides bookingId)
// POST accepts { gateway: "paystack" | "squadco" } in body
router.post("/pay/:token", paymentCtrl.payWithToken);
// GET also supported with ?gateway= query param
router.get("/pay/:token", paymentCtrl.payWithToken);

// Initialize payment with gateway selection (POST for API, GET for browser redirect)
router.post("/initialize", paymentCtrl.initializePayment);
router.get("/initialize", paymentCtrl.initializePaymentGet);

// Callback URL - Paystack/SquadCo redirects here after payment
// This ONLY shows status to user, does NOT confirm payment (webhook handles confirmation)
router.get("/callback", paymentCtrl.handlePaymentCallback);

// Verify payment status (for polling)
router.get("/verify/:reference", paymentCtrl.verifyPayment);

// Webhook endpoints (ONLY these confirm payment - must be accessible without auth)
router.post("/webhook/paystack", paymentCtrl.handlePaystackWebhook);
router.post("/webhook/squadco", paymentCtrl.handleSquadcoWebhook);

// Legacy endpoint (backward compatibility)
router.post("/initiate", paymentCtrl.initiatePayment);

// Mock success for development/testing
router.get("/mock-success", paymentCtrl.mockSuccess);

module.exports = router;



