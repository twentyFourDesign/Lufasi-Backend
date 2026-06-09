
const authRoutes = require("./auth");
const podRoutes = require("./pods");
const availabilityRoutes = require("./availability");
const bookingRoutes = require("./bookings");
const extraRoutes = require("./extras");
const mealPlanRoutes = require("./mealPlans");
const discountRoutes = require("./discounts");
const voucherRoutes = require("./vouchers");
const paymentRoutes = require("./payments");
const adminRoutes = require("./admin");
const uploadRoutes = require("./uploads");
const configRoutes = require("./config");
const channexRoutes = require("./channex");

function registerRoutes(app) {
    // Public routes
    app.use("/auth", authRoutes);
    app.use("/pods", podRoutes);
    app.use("/availability", availabilityRoutes);
    app.use("/bookings", bookingRoutes);
    app.use("/extras", extraRoutes);
    app.use("/meal-plans", mealPlanRoutes);
    app.use("/discounts", discountRoutes);
    app.use("/vouchers", voucherRoutes);
    app.use("/payments", paymentRoutes);
    app.use("/uploads", uploadRoutes);
    app.use("/config", configRoutes);
    app.use("/channex", channexRoutes);

    // Admin protected routes
    app.use("/admin", adminRoutes);
}

module.exports = {
    registerRoutes,
    authRoutes,
    podRoutes,
    availabilityRoutes,
    bookingRoutes,
    extraRoutes,
    mealPlanRoutes,
    discountRoutes,
    voucherRoutes,
    paymentRoutes,
    adminRoutes,
    uploadRoutes,
    configRoutes,
};
