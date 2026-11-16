const express = require("express");
const router = express.Router();
const beds24Ctrl = require("../controllers/beds24Controller");

// Public webhook (no login; shared secret verified)
router.post("/webhook", beds24Ctrl.handleWebhook);

module.exports = router;
