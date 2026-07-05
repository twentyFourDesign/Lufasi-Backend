const express = require("express");
const router = express.Router();
const { quotePricing } = require("../controllers/pricingController");

/** Real-time pricing quote — public for testing and admin tooling */
router.post("/quote", quotePricing);

module.exports = router;
