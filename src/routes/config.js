const express = require("express");
const router = express.Router();
const {
  getPricingConfiguration,
  updatePricingConfiguration,
  getSchoolHolidays,
  createSchoolHoliday,
  updateSchoolHoliday,
  deleteSchoolHoliday,
  getPeakRates,
  createPeakRate,
  updatePeakRate,
  deletePeakRate,
} = require("../controllers/configController");
const { adminAuth } = require("../middleware/auth");

// Pricing configuration
router.get("/pricing", getPricingConfiguration);
router.put("/pricing", adminAuth, updatePricingConfiguration);

// School holidays
router.get("/holidays", getSchoolHolidays);
router.post("/holidays", adminAuth, createSchoolHoliday);
router.put("/holidays/:id", adminAuth, updateSchoolHoliday);
router.delete("/holidays/:id", adminAuth, deleteSchoolHoliday);

// Peak / Off-peak rates  (GET is public so frontend booking flow can fetch)
router.get("/peak-rates", getPeakRates);
router.post("/peak-rates", adminAuth, createPeakRate);
router.put("/peak-rates/:id", adminAuth, updatePeakRate);
router.delete("/peak-rates/:id", adminAuth, deletePeakRate);

module.exports = router;
