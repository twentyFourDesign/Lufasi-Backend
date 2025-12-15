const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { adminAuth } = require("../middleware/auth");

router.post("/", bookingController.createBooking); // public booking creation
router.get("/admin", adminAuth, bookingController.listBookings);
router.get("/:id", adminAuth, bookingController.getBookingDetails);

module.exports = router;
