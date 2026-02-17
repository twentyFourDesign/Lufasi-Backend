const express = require("express");
const router = express.Router();
const {
  getPricingConfiguration,
  updatePricingConfiguration,
} = require("../controllers/configController");
const { adminAuth } = require("../middleware/auth");

router.get("/pricing", getPricingConfiguration);
router.put("/pricing", adminAuth, updatePricingConfiguration);

module.exports = router;
