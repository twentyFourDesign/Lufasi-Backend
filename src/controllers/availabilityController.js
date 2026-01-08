const db = require("../models");
const { Op } = require("sequelize");

function generateDatesArray(startDate, endDate) {
  const arr = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    arr.push(new Date(cur).toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
}

async function checkAvailability(req, res, next) {
  try {
    const {
      startDate,
      endDate,
      adults = 1,
      children = 0,
      infants = 0,
    } = req.body;
    if (!startDate || !endDate)
      return res.status(400).json({ error: "startDate and endDate required" });

    // Simple algorithm: find pods that do not have 'booked' status in that date range
    const dates = generateDatesArray(startDate, endDate);
    const exclusions = await db.CalendarAvailability.findAll({
      where: {
        date: { [Op.in]: dates },
        status: { [Op.in]: ["booked", "blocked"] },
      },
    });

    const occupiedPodIds = new Set(exclusions.map((e) => e.podId));
    const pods = await db.Pod.findAll({
      where: {
        [Op.or]: [
          { isDeleted: false },
          { isDeleted: null }
        ]
      },
      include: ["images", "priceRules"]
    });

    // Format all pods with availability status
    const formattedPods = pods.map((pod) => {
      // Pod is available if:
      // 1. NOT in occupied list (no bookings/blocks for the date range)
      // 2. Has sufficient capacity for guests
      const isAvailable =
        !occupiedPodIds.has(pod.id) &&
        adults <= pod.maxAdults &&
        children <= pod.maxChildren;

      return {
        id: pod.id,
        title: pod.podName,
        desc: pod.description,
        price: parseFloat(pod.baseAdultPrice),
        available: isAvailable,
        tags: pod.rules ? pod.rules.split(",").map((tag) => tag.trim()) : [],
        img: `${req.protocol}://${req.get(
          "host"
        )}/uploads/pods/default-pod.png`,
      };
    });

    res.json(formattedPods);
  } catch (err) {
    next(err);
  }
}

module.exports = { checkAvailability };
