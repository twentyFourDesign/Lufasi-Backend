const express = require("express");
const router = express.Router();
const { checkAvailability } = require("../controllers/availabilityController");

router.post("/check", checkAvailability);

module.exports = router;
