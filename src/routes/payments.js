const express = require("express");
const router = express.Router();
const paymentCtrl = require("../controllers/paymentController");

// Check booking status before payment (handles expiration)
router.get("/check-booking/:bookingId", paymentCtrl.checkBookingForPayment);

router.post("/pay/:token", paymentCtrl.payWithToken);
// GET also supported with ?gateway= query param
router.get("/pay/:token", paymentCtrl.payWithToken);


router.post("/initialize", paymentCtrl.initializePayment);
router.get("/initialize", paymentCtrl.initializePaymentGet);

// Callback URL - Paystack/SquadCo redirects here after payment

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



