const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const podRoutes = require("./routes/pods");
const availabilityRoutes = require("./routes/availability");
const bookingRoutes = require("./routes/bookings");
const extraRoutes = require("./routes/extras");
const discountRoutes = require("./routes/discounts");
const paymentRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

app.get("/", (req, res) =>
  res.json({ ok: true, service: "Lufasi Lodges Booking API" })
);

// Public routes
app.use("/auth", authRoutes);
app.use("/pods", podRoutes);
app.use("/availability", availabilityRoutes);
app.use("/bookings", bookingRoutes);
app.use("/extras", extraRoutes);
app.use("/discounts", discountRoutes);
app.use("/payments", paymentRoutes);

// Admin protected routes
app.use("/admin", adminRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

module.exports = app;
