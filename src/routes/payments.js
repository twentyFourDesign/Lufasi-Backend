const express = require("express");
const router = express.Router();
const paymentCtrl = require("../controllers/paymentController");

// Public: initiate payment (mock)
router.post("/initiate", paymentCtrl.initiatePayment);

// For demo: mock success redirect
router.get("/mock-success", paymentCtrl.mockSuccess);

module.exports = router;
