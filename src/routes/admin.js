const express = require("express");
const router = express.Router();
const { adminAuth } = require("../middleware/auth");

const podRoutes = require("./pods");
const bookingRoutes = require("./bookings");
const extraRoutes = require("./extras");
const discountRoutes = require("./discounts");
const paymentRoutes = require("./payments");

const adminController = require("../controllers/adminController");
const emailService = require("../services/emailService");
const emailConfig = require("../config/emailConfig");

// ---------------------------------------------------------------------------
// Email diagnostics: verify SMTP transporter and optionally send a test email
// ---------------------------------------------------------------------------
router.get("/email/status", adminAuth, async (_req, res) => {
    const configured = emailConfig.isConfigured();
    const status = {
        configured,
        provider: emailConfig.provider,
        from: emailConfig.getFromAddress(),
        adminEmail: emailConfig.adminEmail,
        toggles: emailConfig.enabled,
    };
    if (!configured) {
        return res
            .status(200)
            .json({ ...status, verify: { success: false, message: "Email service not configured (missing GMAIL_USER / GMAIL_APP_PASSWORD or SMTP_* env vars)." } });
    }
    const verify = await emailService.verify();
    res.json({ ...status, verify });
});

router.post("/email/test", adminAuth, async (req, res) => {
    try {
        const to = req.body?.to || emailConfig.adminEmail;
        if (!to) {
            return res
                .status(400)
                .json({ error: "No recipient. Pass { to: 'someone@example.com' } or set ADMIN_EMAIL." });
        }

        const verify = await emailService.verify();
        if (!verify.success) {
            return res.status(500).json({
                step: "verify",
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
                error: send.message,
                from: emailConfig.getFromAddress(),
                to,
                provider: emailConfig.provider,
            });
        }

        res.json({
            success: true,
            from: emailConfig.getFromAddress(),
            to,
            provider: emailConfig.provider,
            messageId: send.messageId,
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Unexpected error sending test email" });
    }
});

// mount admin protected sub-routes (note: these routes assume adminAuth is applied at top-level)
router.use("/pods", adminAuth, require("./pods"));
router.use("/bookings", adminAuth, require("./bookings"));
router.use("/extras", adminAuth, require("./extras"));
router.use("/payments", adminAuth, require("./payments"));
router.use("/discounts", adminAuth, require("./discounts"));

router.get("/dashboard/summary", adminAuth, adminController.dashboardSummary);
router.get("/guests", adminAuth, adminController.getGuestDetails);
router.get("/logs", adminAuth, adminController.getBookingLogs);
router.get("/reports/stats", adminAuth, adminController.getReportsStats);

router.post("/calendar/block", adminAuth, require("../controllers/bookingController").blockRoom);
router.post("/calendar/unblock", adminAuth, require("../controllers/bookingController").unblockRoom);

// Channex channel manager admin routes
router.use("/channex", adminAuth, require("./channexAdmin"));

module.exports = router;
