
const authRoutes = require("./auth");
const podRoutes = require("./pods");
const availabilityRoutes = require("./availability");
const bookingRoutes = require("./bookings");
const extraRoutes = require("./extras");
const mealPlanRoutes = require("./mealPlans");
const discountRoutes = require("./discounts");
const paymentRoutes = require("./payments");
const adminRoutes = require("./admin");
const uploadRoutes = require("./uploads");

function registerRoutes(app) {
    // Public routes
    app.use("/auth", authRoutes);
    app.use("/pods", podRoutes);
    app.use("/availability", availabilityRoutes);
    app.use("/bookings", bookingRoutes);
    app.use("/extras", extraRoutes);
    app.use("/meal-plans", mealPlanRoutes);
    app.use("/discounts", discountRoutes);
    app.use("/payments", paymentRoutes);
    app.use("/uploads", uploadRoutes);

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
    paymentRoutes,
    adminRoutes,
    uploadRoutes,
};
