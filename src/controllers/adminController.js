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

async function getGuestDetails(req, res, next) {
  try {
    const guests = await db.GuestDirectory.findAll({
      order: [["fullName", "ASC"]],
    });

    // Enrich with booking stats if needed, or just return directory
    // For "Show all guest details for successful and failed bookings", we might want to include latest booking status
    // But GuestDirectory is unique by email.
    res.json({ guests });
  } catch (err) {
    next(err);
  }
}

async function getBookingLogs(req, res, next) {
  try {
    const { status, search } = req.query;
    const where = {};

    if (status) where.newStatus = status;

    const logs = await db.BookingLog.findAll({
      where,
      include: [
        {
          model: db.Booking,
          include: [{ model: db.GuestDirectory }]
        }
      ],
      order: [["timestamp", "DESC"]],
      limit: 100 // Cap to prevent overload
    });

    const formattedLogs = logs.map(log => ({
      id: log.id,
      bookingReference: log.Booking?.bookingReference || "N/A",
      guestName: log.Booking?.GuestDirectory?.fullName || "Unknown",
      timestamp: log.timestamp,
      status: log.newStatus,
      errorMessage: log.errorMessage || "NIL"
    }));

    res.json({ logs: formattedLogs });
  } catch (err) {
    next(err);
  }
}

async function getReportsStats(req, res, next) {
  try {
    const { startDate, endDate, podId } = req.query;
    const where = {
      bookingStatus: { [Op.in]: ["paid", "confirmed"] }
    };

    if (startDate && endDate) {
      where.checkIn = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    if (podId) {
      if (Array.isArray(podId)) {
        where.podId = { [Op.in]: podId };
      } else {
        where.podId = podId;
      }
    }

    const bookings = await db.Booking.findAll({
      where,
      include: [
        { model: db.BookingGuest },
        { model: db.BookingExtra } // to calc extras
      ]
    });

    let totalRoomsSold = bookings.length;
    let totalGuests = 0;
    let totalRoomRevenue = 0;
    let totalExtrasRevenue = 0;

    bookings.forEach(b => {
      // Guests
      if (b.BookingGuests && b.BookingGuests.length > 0) {
        const bg = b.BookingGuests[0];
        totalGuests += (bg.adults || 0) + (bg.children || 0) + (bg.toddlers || 0) + (bg.infants || 0);
      }

      // Extras Revenue
      let extraTotal = 0;
      if (b.BookingExtras && b.BookingExtras.length > 0) {
        extraTotal = b.BookingExtras.reduce((sum, be) => sum + parseFloat(be.totalPrice || 0), 0);
      }
      totalExtrasRevenue += extraTotal;

      // Room Revenue = Total Price - Extras (Approximate if we don't store split, but we calculated extras above)
      // Actually totalPrice includes extras. So Room Part = Total - Extras
      totalRoomRevenue += (parseFloat(b.totalPrice) - extraTotal);
    });

    // Total available rooms logic:
    // If date range provided: Total Pods * Days
    // If not: just Total Pods? 
    // Requirement: "Total available rooms". 
    // Let's return Total Pod Count for now, as availability depends on range.
    const totalPods = await db.Pod.count({ where: { isDeleted: false, isActive: true } });

    res.json({
      stats: {
        totalRoomsSold,
        totalAvailableRooms: totalPods, // Static count
        totalRoomRevenue,
        totalExtrasRevenue,
        totalGuests,
        totalIncome: totalRoomRevenue + totalExtrasRevenue
      }
    });

  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboardSummary,
  getGuestDetails,
  getBookingLogs,
  getReportsStats
};

