const { Op } = require("sequelize");
const db = require("../models");
const { splitInclusiveTotal, SERVICE_CHARGE_RATE } = require("../utils/bookingFees");

/**
 * Bookings that count as earned revenue:
 *   paid / confirmed        payment received (online payment sets "confirmed")
 *   confirmed_unassigned    imported OTA booking, no dome allocated yet
 *   ready_for_checkin       any booking once a dome has been allocated to it
 * Pending, failed, abandoned, expired and cancelled bookings are left out.
 */
const COUNTED_STATUSES = ["paid", "confirmed", "confirmed_unassigned", "ready_for_checkin"];
const GROUPS = ["day", "month", "year"];
const MAX_PERIODS = 800;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (v) => String(v).slice(0, 10);

function isValidYmd(s) {
  if (!YMD.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function periodKey(date, groupBy) {
  if (groupBy === "year") return date.slice(0, 4);
  if (groupBy === "month") return date.slice(0, 7);
  return date;
}

/** Every period between two dates, so empty months and years still show as zero. */
function listPeriods(startDate, endDate, groupBy) {
  const keys = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const cur = new Date(start);
  while (cur <= end) {
    keys.push(periodKey(cur.toISOString().slice(0, 10), groupBy));
    if (groupBy === "year") cur.setUTCFullYear(cur.getUTCFullYear() + 1, 0, 1);
    else if (groupBy === "month") cur.setUTCMonth(cur.getUTCMonth() + 1, 1);
    else cur.setUTCDate(cur.getUTCDate() + 1);
    if (keys.length > MAX_PERIODS) break;
  }
  return [...new Set(keys)];
}

/**
 * GET /admin/reports/service-charge
 *   startDate, endDate  YYYY-MM-DD (default: this calendar year)
 *   groupBy             day | month | year (default month)
 *   source              all | direct | ota (default all)
 *
 * Bookings are placed in a period by check-in date, matching the Reports page.
 * Prices stored on bookings include the 12.5% VAT and 2.5% service charge, so
 * the charge is worked out the same way as on the booking details screen.
 */
async function getServiceChargeReport(req, res, next) {
  try {
    const year = new Date().getFullYear();
    const startDate = req.query.startDate || `${year}-01-01`;
    const endDate = req.query.endDate || `${year}-12-31`;
    const groupBy = GROUPS.includes(req.query.groupBy) ? req.query.groupBy : "month";
    const source = ["all", "direct", "ota"].includes(req.query.source) ? req.query.source : "all";

    if (!isValidYmd(startDate) || !isValidYmd(endDate)) {
      return res.status(400).json({ error: "startDate and endDate must be YYYY-MM-DD" });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: "startDate must not be after endDate" });
    }

    const where = {
      bookingStatus: { [Op.in]: COUNTED_STATUSES },
      checkIn: { [Op.between]: [startDate, endDate] },
    };
    if (source === "direct") {
      where[Op.and] = [{ [Op.or]: [{ bookingSource: "direct" }, { bookingSource: null }] }];
    } else if (source === "ota") {
      where.bookingSource = { [Op.and]: [{ [Op.ne]: "direct" }, { [Op.ne]: null }] };
    }

    const bookings = await db.Booking.findAll({
      where,
      include: [{ model: db.GuestDirectory, attributes: ["fullName"] }],
      order: [["checkIn", "ASC"]],
    });

    const periods = new Map(
      listPeriods(startDate, endDate, groupBy).map((k) => [
        k,
        { period: k, bookings: 0, subTotal: 0, vat: 0, serviceCharge: 0, gross: 0 },
      ]),
    );
    const totals = { bookings: 0, subTotal: 0, vat: 0, serviceCharge: 0, gross: 0 };
    const rows = [];

    for (const b of bookings) {
      const gross = Math.round(Number(b.totalPrice) || 0);
      const { subTotal, taxAmount, serviceChargeAmount } = splitInclusiveTotal(gross);
      const checkIn = ymd(b.checkIn);
      const key = periodKey(checkIn, groupBy);

      if (!periods.has(key)) {
        periods.set(key, { period: key, bookings: 0, subTotal: 0, vat: 0, serviceCharge: 0, gross: 0 });
      }
      for (const t of [periods.get(key), totals]) {
        t.bookings += 1;
        t.subTotal += subTotal;
        t.vat += taxAmount;
        t.serviceCharge += serviceChargeAmount;
        t.gross += gross;
      }

      rows.push({
        id: b.id,
        reference: b.bookingReference,
        guestName: b.GuestDirectory?.fullName || "",
        checkIn,
        checkOut: ymd(b.checkOut),
        source: b.bookingSource || "direct",
        status: b.bookingStatus,
        gross,
        subTotal,
        serviceCharge: serviceChargeAmount,
      });
    }

    res.json({
      range: { startDate, endDate },
      groupBy,
      source,
      rate: SERVICE_CHARGE_RATE,
      totals,
      periods: [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)),
      bookings: rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getServiceChargeReport };
