const { Op } = require("sequelize");
const db = require("../models");
const { splitInclusiveTotal, SERVICE_CHARGE_RATE } = require("../utils/bookingFees");

/**
 * Direct and OTA bookings are reported separately and never added together.
 *
 * Direct bookings (made on the Lufasi site or by staff) count once payment is
 * received: status paid/confirmed, or a successful payment record. The report
 * does not look at the "ready_for_checkin" stage at all; that is only a step in
 * the check-in process and says nothing about payment.
 *
 * OTA bookings (Booking.com, Expedia via Beds24) are collected by the OTA, so
 * they count whenever the reservation is live, i.e. not cancelled, expired or
 * failed.
 */
const NOT_LIVE_STATUSES = ["cancelled", "expired", "failed", "abandoned"];
const PAID_STATUSES = ["paid", "confirmed"];
const GROUPS = ["day", "month", "year"];
const MAX_PERIODS = 800;
const PAYMENT_LOOKUP_CHUNK = 500;

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
 *   source              direct | ota (default direct); the two are never combined
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
    const source = req.query.source === "ota" ? "ota" : "direct";

    if (!isValidYmd(startDate) || !isValidYmd(endDate)) {
      return res.status(400).json({ error: "startDate and endDate must be YYYY-MM-DD" });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: "startDate must not be after endDate" });
    }

    const where = {
      bookingStatus: { [Op.notIn]: NOT_LIVE_STATUSES },
      checkIn: { [Op.between]: [startDate, endDate] },
    };
    if (source === "direct") {
      where[Op.and] = [{ [Op.or]: [{ bookingSource: "direct" }, { bookingSource: null }] }];
    } else {
      where.bookingSource = { [Op.and]: [{ [Op.ne]: "direct" }, { [Op.ne]: null }] };
    }

    let bookings = await db.Booking.findAll({
      where,
      include: [{ model: db.GuestDirectory, attributes: ["fullName"] }],
      order: [["checkIn", "ASC"]],
    });

    if (source === "direct") {
      // Keep only bookings whose payment was received.
      const paidIds = new Set();
      const ids = bookings.map((b) => b.id);
      for (let i = 0; i < ids.length; i += PAYMENT_LOOKUP_CHUNK) {
        const payments = await db.BookingPayment.findAll({
          where: {
            bookingId: { [Op.in]: ids.slice(i, i + PAYMENT_LOOKUP_CHUNK) },
            paymentStatus: "successful",
          },
          attributes: ["bookingId"],
        });
        payments.forEach((p) => paidIds.add(p.bookingId));
      }
      bookings = bookings.filter(
        (b) => PAID_STATUSES.includes(b.bookingStatus) || paidIds.has(b.id),
      );
    }

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
