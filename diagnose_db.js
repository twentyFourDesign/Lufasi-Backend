const db = require("./src/models");
const { Op } = require("sequelize");

async function diagnose() {
  try {
    console.log("--- PODS IN DATABASE ---");
    const pods = await db.Pod.findAll();
    pods.forEach(p => {
      console.log(`ID: ${p.id} | Name: ${p.podName} | MaxAdults: ${p.maxAdults} | MaxChildren: ${p.maxChildren} | isActive: ${p.isActive} | isDeleted: ${p.isDeleted}`);
    });

    const startDate = "2026-03-31";
    const endDate = "2026-04-02";
    const dates = [];
    let cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
      dates.push(new Date(cur).toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    console.log("\n--- CALENDAR AVAILABILITY FOR", dates, "---");
    const availability = await db.CalendarAvailability.findAll({
      where: {
        date: { [Op.in]: dates },
        status: { [Op.in]: ["booked", "blocked"] }
      }
    });

    if (availability.length === 0) {
      console.log("No bookings or blocks found for these dates.");
    } else {
      availability.forEach(a => {
        console.log(`PodID: ${a.podId} | Date: ${a.date} | Status: ${a.status}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

diagnose();
