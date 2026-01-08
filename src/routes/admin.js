const express = require("express");
const router = express.Router();
const { adminAuth } = require("../middleware/auth");

const podRoutes = require("./pods");
const bookingRoutes = require("./bookings");
const extraRoutes = require("./extras");
const discountRoutes = require("./discounts");
const paymentRoutes = require("./payments");

const adminController = require("../controllers/adminController");

// mount admin protected sub-routes (note: these routes assume adminAuth is applied at top-level)
router.use("/pods", adminAuth, require("./pods"));
router.use("/bookings", adminAuth, require("./bookings"));
router.use("/extras", adminAuth, require("./extras"));
router.use("/payments", adminAuth, require("./payments"));
router.use("/discounts", adminAuth, require("./discounts"));

router.get("/dashboard/summary", adminAuth, adminController.dashboardSummary);
router.get("/guests", adminAuth, adminController.getGuestDetails);
router.get("/logs", adminAuth, adminController.getBookingLogs);
router.get("/reports/stats", adminAuth, adminController.getReportsStats);

module.exports = router;
