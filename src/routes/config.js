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
const emailService = require("../services/emailService");
const emailConfig = require("../config/emailConfig");

// TEMPORARY: public email-test endpoint used by the home-page test button.
// REMOVE BEFORE GOING LIVE.
router.post("/email/test-public", async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: "Provide a valid 'to' email address." });
    }

    const verify = await emailService.verify();
    if (!verify.success) {
      return res.status(500).json({
        step: "verify",
        ok: false,
        error: verify.message,
        from: emailConfig.getFromAddress(),
        provider: emailConfig.provider,
      });
    }

    const send = await emailService.sendEmail({
      to,
      subject: "Lufasi Lodges — email test",
      html: `<p>Hi,</p><p>This is a test email from the Lufasi Lodges booking API to confirm SMTP delivery is working.</p><p>Sent at <strong>${new Date().toISOString()}</strong> from <strong>${emailConfig.getFromAddress()}</strong>.</p>`,
    });

    if (!send.success) {
      return res.status(500).json({
        step: "send",
        ok: false,
        error: send.message,
        from: emailConfig.getFromAddress(),
        to,
        provider: emailConfig.provider,
      });
    }

    res.json({
      ok: true,
      from: emailConfig.getFromAddress(),
      to,
      provider: emailConfig.provider,
      messageId: send.messageId,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "Unexpected error" });
  }
});

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
