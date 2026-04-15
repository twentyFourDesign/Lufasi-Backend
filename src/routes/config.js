const express = require("express");
const router = express.Router();
const {
  getPricingConfiguration,
  updatePricingConfiguration,
  getSchoolHolidays,
  createSchoolHoliday,
  updateSchoolHoliday,
  deleteSchoolHoliday,
} = require("../controllers/configController");
const { adminAuth } = require("../middleware/auth");

router.get("/pricing", getPricingConfiguration);
router.put("/pricing", adminAuth, updatePricingConfiguration);
router.get("/holidays", getSchoolHolidays);
router.post("/holidays", adminAuth, createSchoolHoliday);
router.put("/holidays/:id", adminAuth, updateSchoolHoliday);
router.delete("/holidays/:id", adminAuth, deleteSchoolHoliday);

module.exports = router;
