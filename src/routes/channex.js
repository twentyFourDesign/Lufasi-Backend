const express = require("express");
const router = express.Router();
const channexCtrl = require("../controllers/channexController");

// Public webhook (no auth — signature verified)
router.post("/webhook", channexCtrl.handleWebhook);

module.exports = router;
