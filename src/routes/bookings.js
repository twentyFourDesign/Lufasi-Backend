const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { adminAuth } = require("../middleware/auth");

router.post("/", bookingController.createBooking); // public booking creation
router.post("/find", bookingController.findBooking); // find booking by reference
router.put("/:id", bookingController.updateBooking); // update booking
router.get("/admin", adminAuth, bookingController.listBookings);
router.get("/:id", adminAuth, bookingController.getBookingDetails);

// Admin email actions
router.post(
  "/:id/send-confirmation",
  adminAuth,
  bookingController.sendConfirmation,
);
router.post("/:id/resend-invoice", adminAuth, bookingController.resendInvoice);
router.post("/:id/allocate-pod", adminAuth, bookingController.allocatePod);
router.post("/:id/cancel", adminAuth, bookingController.cancelBooking);

module.exports = router;
