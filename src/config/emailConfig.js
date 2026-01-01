

require("dotenv").config();

const emailConfig = {

    provider: process.env.EMAIL_PROVIDER || "gmail",

    from: {
        name: process.env.EMAIL_FROM_NAME || "Lufasi Lodges",
        address: process.env.EMAIL_FROM_ADDRESS || "noreply@lufasilodges.com",
    },

    // Gmail configuration
    gmail: {
        user: process.env.GMAIL_USER || "",
        password: process.env.GMAIL_APP_PASSWORD || "",
        service: "gmail",
    },

    // SMTP configuration
    smtp: {
        host: process.env.SMTP_HOST || "smtp.example.com",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER || "",
            pass: process.env.SMTP_PASSWORD || "",
        },
    },

    // Email toggles
    enabled: {
        bookingConfirmation: process.env.EMAIL_BOOKING_CONFIRMATION !== "false",
        paymentSuccess: process.env.EMAIL_PAYMENT_SUCCESS !== "false",
        paymentFailed: process.env.EMAIL_PAYMENT_FAILED !== "false",
        bookingCancellation: process.env.EMAIL_BOOKING_CANCELLATION !== "false",
        bookingReminder: process.env.EMAIL_BOOKING_REMINDER !== "false",
        adminAlerts: process.env.EMAIL_ADMIN_ALERTS !== "false",
    },

    adminEmail: process.env.ADMIN_EMAIL || "admin@lufasilodges.com",


    getTransportConfig() {
        if (this.provider === "gmail") {
            return {
                service: this.gmail.service,
                auth: {
                    user: this.gmail.user,
                    pass: this.gmail.password,
                },
            };
        }

        // SMTP configuration
        return {
            host: this.smtp.host,
            port: this.smtp.port,
            secure: this.smtp.secure,
            auth: this.smtp.auth,
        };
    },

    getFromAddress() {
        return `"${this.from.name}" <${this.from.address}>`;
    },


    isConfigured() {
        if (this.provider === "gmail") {
            return !!(this.gmail.user && this.gmail.password);
        }
        return !!(this.smtp.host && this.smtp.auth.user && this.smtp.auth.pass);
    },
};

module.exports = emailConfig;
