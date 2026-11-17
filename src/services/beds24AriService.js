/**
 * Availability and price sync from Lufasi to Beds24 (which forwards to
 * Booking.com and Expedia).
 *
 * Lufasi stays the single source of truth: one pooled room type whose count is
 * total domes minus active bookings minus blocked domes, per night.
 */
const beds24Config = require("../config/beds24Config");
const beds24Service = require("./beds24Service");
const { getPricingConfigOrDefault } = require("./inventoryService");
const {
  enqueueSync,
  markProcessing,
  markSuccess,
  markFailed,
} = require("./channexSyncOutbox");
const db = require("../models");
const { Op } = require("sequelize");
const {
  iterStayNights,
  toYmd,
  isWeekdayPeakNight,
  getSeasonalPercentForDate,
} = require("../utils/weekdayPeakPricing");
const { getNightRatesFromConfig } = require("../utils/pricingRates");
const { activeBookingWhere } = require("../utils/inventoryHolds");
const { retryInBackground } = require("../utils/pushRetry");

const SYNC_PUSH = "beds24-push-ari";

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

function todayYmd() {
  return toYmd(new Date());
}

const ymd = (v) => String(v).slice(0, 10);

/**
 * Free domes per night for [dateFrom, dateTo] (inclusive of dateTo).
 * One query for bookings and one for blocks, not one per night.
 */
async function computeAvailabilityMap(dateFrom, dateTo) {
  const config = await getPricingConfigOrDefault();
  const total = config.totalPodsAvailable || 6;
  const nights = iterStayNights(dateFrom, addDays(dateTo, 1)).map(toYmd);
  if (!nights.length) return { map: {}, totalPods: total };

  const rangeEnd = addDays(dateTo, 1);

  const bookings = await db.Booking.findAll({
    where: activeBookingWhere({
      checkIn: { [Op.lt]: rangeEnd },
      checkOut: { [Op.gt]: dateFrom },
    }),
    attributes: ["id", "checkIn", "checkOut", "podsCount", "podCount"],
  });

  let excludedIds = new Set();
  if (beds24Config.availMode === "beds24-subtracts" && bookings.length) {
    const mapped = await db.Beds24BookingMap.findAll({
      where: { bookingId: { [Op.in]: bookings.map((b) => b.id) } },
      attributes: ["bookingId"],
    });
    excludedIds = new Set(mapped.map((m) => m.bookingId));
  }

  const sold = {};
  for (const b of bookings) {
    if (excludedIds.has(b.id)) continue;
    const pods = b.podsCount || b.podCount || 1;
    for (const night of iterStayNights(ymd(b.checkIn), ymd(b.checkOut))) {
      const key = toYmd(night);
      sold[key] = (sold[key] || 0) + pods;
    }
  }

  const blockedRows = await db.CalendarAvailability.findAll({
    attributes: ["podId", "date"],
    where: { status: "blocked", date: { [Op.between]: [dateFrom, dateTo] } },
  });
  const blockedByDate = {};
  for (const r of blockedRows) {
    const key = ymd(r.date);
    (blockedByDate[key] = blockedByDate[key] || new Set()).add(r.podId);
  }

  const map = {};
  for (const night of nights) {
    const blocked = blockedByDate[night]?.size || 0;
    map[night] = Math.max(0, total - (sold[night] || 0) - blocked);
  }
  return { map, totalPods: total };
}

/**
 * Nightly prices for 1 and 2 adults: the pre-tax base price with seasonal
 * adjustment. OTA extranets add 12.5% VAT + 2.5% service charge.
 */
async function computeRatesMap(dateFrom, dateTo) {
  const config = await getPricingConfigOrDefault();
  const seasonalRates = await db.PeakRate.findAll({ where: { isActive: true } });
  const seasonal = seasonalRates.map((r) => ({
    startDate: r.startDate,
    endDate: r.endDate,
    percentageAdjustment: Number(r.percentageAdjustment),
    isActive: r.isActive,
  }));

  const map = {};
  for (const night of iterStayNights(dateFrom, addDays(dateTo, 1))) {
    const key = toYmd(night);
    const isPeak = isWeekdayPeakNight(night);
    const { basePerPod, extraGuestFee } = getNightRatesFromConfig(config, isPeak);
    const multiplier = 1 + getSeasonalPercentForDate(key, seasonal) / 100;

    map[key] = {
      price1: Math.round(basePerPod * multiplier * 100) / 100,
      price2: Math.round((basePerPod + extraGuestFee) * multiplier * 100) / 100,
      isPeak,
    };
  }
  return map;
}

function groupConsecutive(dates, signature) {
  const sorted = [...dates].sort();
  const groups = [];
  for (const d of sorted) {
    const sig = signature(d);
    const last = groups[groups.length - 1];
    if (last && last.sig === sig && addDays(last.to, 1) === d) {
      last.to = d;
    } else {
      groups.push({ from: d, to: d, sig });
    }
  }
  return groups;
}

/** Calendar entries for Beds24, merging consecutive nights with identical values. */
function buildCalendarEntries(availability, rates) {
  const dates = Object.keys(availability);
  const sig = (d) =>
    `${availability[d]}|${rates[d]?.price1 ?? ""}|${rates[d]?.price2 ?? ""}`;

  return groupConsecutive(dates, sig).map((g) => {
    const [, p1, p2] = g.sig.split("|");
    const entry = {
      from: g.from,
      to: g.to,
      numAvail: availability[g.from],
      minStay: beds24Config.minStay,
    };
    if (p1 !== "") entry.price1 = Number(p1);
    if (p2 !== "") entry.price2 = Number(p2);
    return entry;
  });
}

async function previewAri({ dateFrom, dateTo } = {}) {
  const from = dateFrom || todayYmd();
  const to = dateTo || addDays(from, Math.min(beds24Config.ariWindowDays, 30) - 1);

  const [{ map: availability }, rates] = await Promise.all([
    computeAvailabilityMap(from, to),
    computeRatesMap(from, to),
  ]);

  return Object.keys(availability)
    .sort()
    .map((date) => ({
      date,
      availability: availability[date],
      price1: rates[date]?.price1 ?? null,
      price2: rates[date]?.price2 ?? null,
      isPeak: rates[date]?.isPeak ?? false,
    }));
}

async function pushAriToBeds24({ dateFrom, dateTo, syncLogEntry } = {}) {
  if (!beds24Service.isConfigured()) {
    return { skipped: true, reason: "Beds24 not configured" };
  }

  const from = dateFrom || todayYmd();
  const to = dateTo || addDays(from, beds24Config.ariWindowDays - 1);

  const [{ map: availability }, rates] = await Promise.all([
    computeAvailabilityMap(from, to),
    computeRatesMap(from, to),
  ]);

  const entries = buildCalendarEntries(availability, rates);
  const size = beds24Config.calendarBatchSize;
  const warnings = [];

  for (let i = 0; i < entries.length; i += size) {
    const res = await beds24Service.pushCalendar(entries.slice(i, i + size));
    // Beds24 answers a list of per-room results; surface anything not successful.
    const items = Array.isArray(res) ? res : res?.data || [];
    for (const item of items) {
      if (item && item.success === false) {
        warnings.push(item.errors || item.error || "Beds24 rejected an entry");
      }
    }
  }

  if (warnings.length) {
    throw new Error(`Beds24 rejected part of the update: ${JSON.stringify(warnings).slice(0, 300)}`);
  }

  if (syncLogEntry) {
    await markSuccess(syncLogEntry, {
      dateFrom: from,
      dateTo: to,
      entries: entries.length,
    });
  }

  return { success: true, dateFrom: from, dateTo: to, entries: entries.length };
}

/** Enqueue and run a push for a date range or the whole window. */
async function triggerAriPush({ dateFrom, dateTo, idempotencyKey } = {}) {
  if (!beds24Config.enabled) {
    return { skipped: true, reason: "Beds24 disabled" };
  }

  const { entry, skipped } = await enqueueSync({
    syncType: SYNC_PUSH,
    payload: { dateFrom, dateTo },
    idempotencyKey:
      idempotencyKey ||
      `${SYNC_PUSH}:${dateFrom || "full"}:${dateTo || "full"}:${Date.now()}`,
  });
  if (skipped) return { skipped: true, entryId: entry.id };

  try {
    await markProcessing(entry);
    const result = await pushAriToBeds24({ dateFrom, dateTo, syncLogEntry: entry });
    return { ...result, entryId: entry.id };
  } catch (err) {
    await markFailed(entry, err);
    throw err;
  }
}

function alertPushFailure({ dateFrom, dateTo }, reason) {
  const emailService = require("./emailService");
  const emailConfig = require("../config/emailConfig");
  console.error(`[Beds24] push ${dateFrom}..${dateTo} still failing: ${reason}`);
  if (!emailConfig.isConfigured() || !emailConfig.adminEmail) return;
  emailService
    .sendEmail({
      to: emailConfig.adminEmail,
      subject: "Availability update to Beds24 is failing",
      html: `<p>Lufasi could not update availability for ${dateFrom} to ${dateTo} after several tries.</p><p>Reason: ${reason}</p><p>Until it succeeds, Booking.com and Expedia may still sell domes that are no longer free for these dates. The system keeps retrying every 10 minutes.</p>`,
    })
    .catch(() => {});
}

/**
 * Event-driven push after a booking, cancellation, expiry, block or edit.
 * checkOut is exclusive; a single date (checkIn >= checkOut) covers that one night.
 * Fails soft: retries in the background and emails the admin if it keeps failing.
 */
async function triggerAriPushForStay(checkIn, checkOut) {
  if (!beds24Config.enabled) return { skipped: true, reason: "Beds24 disabled" };

  const from = ymd(checkIn);
  let to = ymd(checkOut || checkIn);
  if (to <= from) to = addDays(from, 1);
  const dateFrom = from;
  const dateTo = addDays(to, -1);

  const push = () =>
    triggerAriPush({
      dateFrom,
      dateTo,
      idempotencyKey: `${SYNC_PUSH}-stay:${dateFrom}:${dateTo}:${Date.now()}`,
    });

  try {
    return await push();
  } catch (err) {
    console.error(`[Beds24] push ${dateFrom}..${dateTo} failed, retrying shortly:`, err.message);
    retryInBackground(push, {
      label: "Beds24",
      firstError: err.message,
      onGiveUp: (reason) => alertPushFailure({ dateFrom, dateTo }, reason),
    });
    return { retrying: true, dateFrom, dateTo };
  }
}

/**
 * Drift check: compare Lufasi's counts with what Beds24 holds.
 * UNVERIFIED read-back shape; unreadable data is reported, not guessed.
 */
async function reconcileAvailability({ dateFrom, dateTo } = {}) {
  if (!beds24Service.isConfigured()) {
    return { skipped: true, reason: "Beds24 not configured" };
  }

  const from = dateFrom || todayYmd();
  const to = dateTo || addDays(from, 14);

  const [{ map: local }, remote] = await Promise.all([
    computeAvailabilityMap(from, to),
    beds24Service.getCalendar({ dateFrom: from, dateTo: to }),
  ]);

  const rows = Array.isArray(remote) ? remote : remote?.data || [];
  const calendar = rows.find((r) => String(r.roomId) === String(beds24Config.roomId))?.calendar || [];

  const remoteMap = {};
  for (const c of calendar) {
    if (c.numAvail === undefined) continue;
    for (const night of iterStayNights(c.from, addDays(c.to || c.from, 1))) {
      remoteMap[toYmd(night)] = c.numAvail;
    }
  }

  const drifts = [];
  for (const [date, localAvail] of Object.entries(local)) {
    const remoteAvail = remoteMap[date];
    if (remoteAvail !== undefined && remoteAvail !== localAvail) {
      drifts.push({ date, local: localAvail, remote: remoteAvail });
    }
  }

  return {
    from,
    to,
    drifts,
    driftCount: drifts.length,
    comparedDates: Object.keys(remoteMap).length,
  };
}

module.exports = {
  computeAvailabilityMap,
  computeRatesMap,
  buildCalendarEntries,
  previewAri,
  pushAriToBeds24,
  triggerAriPush,
  triggerAriPushForStay,
  reconcileAvailability,
  SYNC_PUSH,
};
