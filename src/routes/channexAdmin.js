const express = require("express");
const router = express.Router();
const channexCtrl = require("../controllers/channexController");

router.get("/status", channexCtrl.getStatus);
router.get("/preview", channexCtrl.getPreview);
router.get("/logs", channexCtrl.getSyncLogs);
router.get("/reconcile", channexCtrl.reconcile);
router.post("/push-ari", channexCtrl.pushAri);
router.post("/pull-bookings", channexCtrl.pullBookings);

module.exports = router;
