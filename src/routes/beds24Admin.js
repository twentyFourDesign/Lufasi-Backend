const express = require("express");
const router = express.Router();
const beds24Ctrl = require("../controllers/beds24Controller");

router.get("/status", beds24Ctrl.getStatus);
router.get("/preview", beds24Ctrl.getPreview);
router.get("/logs", beds24Ctrl.getSyncLogs);
router.get("/reconcile", beds24Ctrl.reconcile);
router.post("/push-ari", beds24Ctrl.pushAri);
router.post("/pull-bookings", beds24Ctrl.pullBookings);

module.exports = router;
