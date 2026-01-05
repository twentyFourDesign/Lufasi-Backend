const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

// Import all routes from central index
const { registerRoutes } = require("./routes");

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// Serve static files (images) from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check
app.get("/", (req, res) =>
  res.json({ ok: true, service: "Lufasi Lodges Booking API" })
);

// Register all routes
registerRoutes(app);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

module.exports = app;
