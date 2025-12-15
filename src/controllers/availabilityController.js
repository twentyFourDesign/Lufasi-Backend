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
    const pods = await db.Pod.findAll({ include: ["images", "priceRules"] });

    // Filter pods by occupancy rules
    const available = pods.filter(
      (pod) =>
        !occupiedPodIds.has(pod.id) &&
        adults <= pod.maxAdults &&
        children <= pod.maxChildren
    );
    res.json({
      availablePods: available.map((p) => ({
        id: p.id,
        podName: p.podName,
        baseAdultPrice: p.baseAdultPrice,
        images: p.images,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { checkAvailability };
