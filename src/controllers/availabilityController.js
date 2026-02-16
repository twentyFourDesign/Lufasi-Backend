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

    const exclusions = await db.CalendarAvailability.findAll({
      where: whereClause,
    });

    const occupiedPodIds = new Set(exclusions.map((e) => e.podId));
    const pods = await db.Pod.findAll({
      where: {
        [Op.or]: [{ isDeleted: false }, { isDeleted: null }],
      },
      include: ["images", "priceRules"],
    });

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

    res.json(formattedPods);
  } catch (err) {
    next(err);
  }
}

module.exports = { checkAvailability };
