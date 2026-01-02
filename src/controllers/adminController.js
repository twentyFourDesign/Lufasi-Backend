const db = require("../models");
const { Op, fn, col, literal } = require("sequelize");


async function dashboardSummary(req, res, next) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Basic Stats
    const totalBookings = await db.Booking.count();

    const paidBookings = await db.Booking.count({
      where: { bookingStatus: "paid" }
    });

    const confirmedBookings = await db.Booking.count({
      where: { bookingStatus: "confirmed" }
    });

    const pendingBookings = await db.Booking.count({
      where: { bookingStatus: "pending" }
    });

    const cancelledBookings = await db.Booking.count({
      where: { bookingStatus: "cancelled" }
    });

    const failedBookings = await db.Booking.count({
      where: { bookingStatus: "failed" }
    });

    // Revenue from paid/confirmed bookings
    const revenueResult = await db.Booking.sum("totalPrice", {
      where: {
        bookingStatus: { [Op.in]: ["paid", "confirmed"] }
      },
    });

    // Occupancy rate calculation (bookings with check-in today or in future / total pods)
    const totalPods = await db.Pod.count();
    const activeBookingsToday = await db.Booking.count({
      where: {
        checkIn: { [Op.lte]: today },
        checkOut: { [Op.gte]: today },
        bookingStatus: { [Op.in]: ["paid", "confirmed"] }
      }
    });
    const occupancyRate = totalPods > 0 ? Math.round((activeBookingsToday / totalPods) * 100) : 0;

    // 2. Booking Status Breakdown (for pie chart)
    const successful = paidBookings + confirmedBookings;
    const statusBreakdown = {
      successful,
      failed: failedBookings,
      cancelled: cancelledBookings,
      pending: pendingBookings,
    };

    // 3. Pods Occupancy (booking count per pod in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const pods = await db.Pod.findAll({
      attributes: ["id", "podName"],
      order: [["podName", "ASC"]],
    });

    const podsOccupancy = await Promise.all(
      pods.map(async (pod) => {
        const bookingCount = await db.Booking.count({
          where: {
            podId: pod.id,
            bookingStatus: { [Op.in]: ["paid", "confirmed"] },
            checkIn: { [Op.gte]: thirtyDaysAgo },
          },
        });
        // Calculate occupancy as percentage (assuming max 30 days booking possible)
        const occupancyPercent = Math.min(100, Math.round((bookingCount / 30) * 100));
        return {
          id: pod.id,
          name: pod.podName,
          value: occupancyPercent,
          bookings: bookingCount,
        };
      })
    );

    // 4. Latest Bookings (most recent 5)
    const latestBookings = await db.Booking.findAll({
      limit: 5,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: db.GuestDirectory,
          attributes: ["fullName", "email", "phone"],
        },
        {
          model: db.Pod,
          attributes: ["podName"],
        },
      ],
    });

    const formattedLatestBookings = latestBookings.map((booking) => ({
      id: booking.id,
      bookingReference: booking.bookingReference,
      guestName: booking.GuestDirectory?.fullName || "Unknown Guest",
      guestEmail: booking.GuestDirectory?.email || "",
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      pod: booking.Pod?.podName || "Unknown Pod",
      amount: parseFloat(booking.totalPrice) || 0,
      status: booking.bookingStatus,
    }));

    // 5. Upcoming Check-ins (next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingCheckIns = await db.Booking.findAll({
      where: {
        checkIn: {
          [Op.between]: [today, sevenDaysFromNow],
        },
        bookingStatus: { [Op.in]: ["paid", "confirmed", "pending"] },
      },
      limit: 5,
      order: [["checkIn", "ASC"]],
      include: [
        {
          model: db.GuestDirectory,
          attributes: ["fullName", "email", "phone"],
        },
        {
          model: db.Pod,
          attributes: ["podName"],
        },
      ],
    });

    const formattedUpcomingCheckIns = upcomingCheckIns.map((booking) => ({
      id: booking.id,
      bookingReference: booking.bookingReference,
      guestName: booking.GuestDirectory?.fullName || "Unknown Guest",
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      pod: booking.Pod?.podName || "Unknown Pod",
      amount: parseFloat(booking.totalPrice) || 0,
      status: booking.bookingStatus,
    }));

    // Return comprehensive dashboard data
    res.json({
      stats: {
        totalBookings,
        occupancyRate,
        revenue: revenueResult || 0,
        pending: pendingBookings,
      },
      statusBreakdown,
      podsOccupancy,
      latestBookings: formattedLatestBookings,
      upcomingCheckIns: formattedUpcomingCheckIns,
    });
  } catch (err) {
    console.error("Dashboard Summary Error:", err);
    next(err);
  }
}

module.exports = { dashboardSummary };

