const db = require("../models");
const { Op } = require("sequelize");

async function dashboardSummary(req, res, next) {
  try {
    // simple metrics
    const totalBookings = await db.Booking.count();
    const revenueResult = await db.Booking.sum("totalPrice", {
      where: { bookingStatus: "paid" },
    });
    const upcoming = await db.Booking.findAll({
      where: { checkIn: { [Op.gte]: new Date() } },
      limit: 5,
      order: [["checkIn", "ASC"]],
    });

    res.json({ totalBookings, revenue: revenueResult || 0, upcoming });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboardSummary };
