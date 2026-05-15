const db = require("../models");
const { Op } = require("sequelize");
const { getActivePeakRateForDates } = require("./configController");
const {
  getWeekdayPeakInfoFromConfig,
  calculateStayRoomSubtotal,
} = require("../utils/weekdayPeakPricing");

function generateDatesArray(startDate, endDate) {
  const arr = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  
  // If checking a single day (start == end), just check that day
  if (cur.getTime() === end.getTime()) {
    arr.push(new Date(cur).toISOString().slice(0, 10));
    return arr;
  }

  while (cur < end) {
    arr.push(new Date(cur).toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
}

async function checkAvailability(req, res, next) {
  try {
    const { startDate, endDate, excludeBookingId } = req.body;
    if (!startDate || !endDate)
      return res.status(400).json({ error: "startDate and endDate required" });

    const dates = generateDatesArray(startDate, endDate);

    const whereClause = {
      date: { [Op.in]: dates },
      status: { [Op.in]: ["booked", "blocked"] },
    };

    if (excludeBookingId) {
      whereClause.bookingId = { [Op.ne]: excludeBookingId };
    }

    const [exclusions, pods, peakRateInfo, pricingConfig, seasonalRates] =
      await Promise.all([
        db.CalendarAvailability.findAll({ where: whereClause }),
        db.Pod.findAll({
          where: {
            [Op.or]: [{ isDeleted: false }, { isDeleted: null }],
          },
          include: ["images", "priceRules"],
        }),
        getActivePeakRateForDates(startDate, endDate),
        db.PricingConfiguration.findByPk(1),
        db.PeakRate.findAll({ where: { isActive: true } }),
      ]);

    const occupiedPodIds = new Set(exclusions.map((e) => e.podId));

    console.log(
      `Found ${pods.length} pods in database matching isDeleted filter`,
    );

    const formattedPods = pods.map((pod) => {
      const isOccupied = occupiedPodIds.has(pod.id);
      const isAvailable = !isOccupied;

      return {
        id: pod.id,
        title: pod.podName,
        desc: pod.description,
        price: parseFloat(pod.baseAdultPrice),
        available: isAvailable,
        tags:
          typeof pod.rules === "string"
            ? pod.rules.split(",").map((tag) => tag.trim())
            : [],
        img: `${req.protocol}://${req.get(
          "host",
        )}/uploads/pods/default-pod.png`,
      };
    });

    const weekdayPeakInfo = getWeekdayPeakInfoFromConfig();
    const stayPreview = calculateStayRoomSubtotal({
      checkIn: startDate,
      checkOut: endDate,
      podsCount: 1,
      guestsCount: 2,
      pricingConfig: pricingConfig || {},
      seasonalRates: seasonalRates.map((r) => ({
        startDate: r.startDate,
        endDate: r.endDate,
        percentageAdjustment: Number(r.percentageAdjustment),
        isActive: r.isActive,
      })),
    });

    res.json({
      pods: formattedPods,
      peakRateInfo: peakRateInfo
        ? {
            id: peakRateInfo.id,
            name: peakRateInfo.name,
            percentageAdjustment: peakRateInfo.percentageAdjustment,
            type: peakRateInfo.percentageAdjustment >= 0 ? "peak" : "off_peak",
          }
        : null,
      weekdayPeakInfo: {
        ...weekdayPeakInfo,
        peakNights: stayPreview.peakNights,
        offPeakNights: stayPreview.offPeakNights,
        nights: stayPreview.nights,
      },
      seasonalRatePeriods: seasonalRates.map((r) => ({
        startDate: r.startDate,
        endDate: r.endDate,
        percentageAdjustment: Number(r.percentageAdjustment),
        isActive: r.isActive,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { checkAvailability };
