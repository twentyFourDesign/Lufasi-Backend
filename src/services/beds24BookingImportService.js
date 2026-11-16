/**
 * Import reservations from Beds24 (Booking.com, Expedia and manual entries)
 * into Lufasi so one system holds every booking.
 *
 * Lufasi never writes bookings to Beds24, only availability and prices, so
 * there is no loop. Field names below follow the Beds24 v2 booking object
 * and are UNVERIFIED until tested with a live account.
 */
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const db = require("../models");
const beds24Config = require("../config/beds24Config");
const beds24Service = require("./beds24Service");
const { triggerAriPushForStay } = require("./beds24AriService");
const {
  enqueueSync,
  markProcessing,
  markSuccess,
  markFailed,
  getLastSuccessful,
} = require("./channexSyncOutbox");
const { withAdvisoryLock, INVENTORY_LOCK_KEY } = require("../utils/advisoryLock");
const {
  getPricingConfigOrDefault,
  getSoldPodsForDate,
  getBlockedPodsForDate,
} = require("./inventoryService");
const { iterStayNights, toYmd } = require("../utils/weekdayPeakPricing");
const emailService = require("./emailService");
const emailConfig = require("../config/emailConfig");

const SYNC_PULL = "beds24-pull-bookings";
const INITIAL_PULL_DAYS = Number(process.env.BEDS24_INITIAL_PULL_DAYS) || 365;
const FAILURE_EMAIL_INTERVAL_MS = 60 * 60 * 1000;
let lastFailureEmailAt = 0;

/** Beds24 statuses that mean "a real reservation holds a dome". */
const ACTIVE_STATUSES = ["confirmed", "new"];
const CANCELLED_STATUSES = ["cancelled"];

const ymd = (v) => String(v || "").slice(0, 10);

/** UNVERIFIED channel codes; anything unknown is kept as Beds24 sent it. */
function normaliseChannel(raw) {
  const c = String(raw.channel || raw.apiSource || raw.referer || "").toLowerCase();
  if (!c) return "beds24";
  if (c.includes("booking")) return "booking.com";
  if (c.includes("expedia")) return "expedia";
  return c.slice(0, 50);
}

function extractBooking(raw) {
  return {
    id: String(raw.id),
    status: String(raw.status || "").toLowerCase(),
    checkIn: ymd(raw.arrival),
    checkOut: ymd(raw.departure),
    adults: Number(raw.numAdult) || 1,
    children: Number(raw.numChild) || 0,
    firstName: raw.firstName || "",
    lastName: raw.lastName || "",
    email: raw.email || "",
    phone: raw.phone || raw.mobile || "",
    price: Number(raw.price) || 0,
    currency: raw.currency || "NGN",
    channel: normaliseChannel(raw),
    apiReference: raw.apiReference || raw.referer || null,
    modified: String(raw.modifiedTime || raw.modified || raw.bookingTime || ""),
  };
}

async function resolveDefaultPodId(transaction) {
  const pod = await db.Pod.findOne({
    where: { isDeleted: false, isActive: true },
    order: [["podName", "ASC"]],
    transaction,
  });
  return pod?.id || null;
}

/** Any night with more domes sold or blocked than Lufasi has. */
async function stayIsOversold(checkIn, checkOut, transaction) {
  const config = await getPricingConfigOrDefault();
  const total = config.totalPodsAvailable || 6;
  for (const night of iterStayNights(checkIn, checkOut)) {
    const key = toYmd(night);
    const sold = await getSoldPodsForDate(key, { transaction });
    const blocked = await getBlockedPodsForDate(key, { transaction });
    if (sold + blocked > total) return true;
  }
  return false;
}

async function freeCalendarRows(bookingId, transaction) {
  await db.CalendarAvailability.destroy({ where: { bookingId }, transaction });
}

/**
 * Mark the stay on the dome calendar, but only on nights that are still free
 * for that dome, so an existing row is never clashed with.
 */
async function markCalendarRows(bookingId, checkIn, checkOut, podId, transaction) {
  const nights = iterStayNights(checkIn, checkOut).map(toYmd);
  if (!nights.length) return;
  const taken = await db.CalendarAvailability.findAll({
    attributes: ["date"],
    where: { podId, date: { [Op.in]: nights } },
    transaction,
  });
  const takenSet = new Set(taken.map((r) => ymd(r.date)));
  for (const date of nights) {
    if (takenSet.has(date)) continue;
    await db.CalendarAvailability.create(
      { podId, date, status: "booked", bookingId },
      { transaction },
    );
  }
}

async function logChange(bookingId, action, oldStatus, newStatus, transaction) {
  await db.BookingLog.create(
    { id: uuidv4(), bookingId, action, oldStatus, newStatus },
    { transaction },
  );
}

async function createFromBeds24(b, transaction) {
  const podId = await resolveDefaultPodId(transaction);
  if (!podId) throw new Error("No active pod found for Beds24 booking import");

  const guestDir = await db.GuestDirectory.create(
    {
      id: uuidv4(),
      fullName: [b.firstName, b.lastName].filter(Boolean).join(" ") || "OTA Guest",
      email: b.email || `ota-${uuidv4().slice(0, 8)}@import.lufasi.local`,
      phone: b.phone,
    },
    { transaction },
  );

  const booking = await db.Booking.create(
    {
      id: uuidv4(),
      bookingReference: `LUF-B24-${b.id}`,
      guestDirectoryId: guestDir.id,
      podId,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      totalPrice: b.price,
      bookingStatus: "confirmed_unassigned",
      bookingSource: b.channel,
      boardType: "fullBoard",
      podCount: 1,
      podsCount: 1,
      guestsCount: b.adults + b.children,
      configCurrency: b.currency,
      expiresAt: null,
    },
    { transaction },
  );

  await db.BookingGuest.create(
    {
      id: uuidv4(),
      bookingId: booking.id,
      adults: b.adults,
      children: b.children,
      toddlers: 0,
      infants: 0,
    },
    { transaction },
  );

  return booking;
}

/**
 * Apply one Beds24 booking to Lufasi inside the inventory lock.
 * Returns { action, booking, overbooked, previous } where action is one of
 * created | modified | cancelled | unchanged | ignored.
 */
async function applyBooking(b, transaction) {
  const existingMap = await db.Beds24BookingMap.findOne({
    where: { beds24BookingId: b.id },
    transaction,
  });

  if (existingMap && existingMap.lastStatus === b.status && existingMap.lastModified === b.modified) {
    return { action: "unchanged" };
  }

  // Cancellation
  if (CANCELLED_STATUSES.includes(b.status)) {
    if (!existingMap?.bookingId) return { action: "ignored" };
    const booking = await db.Booking.findByPk(existingMap.bookingId, { transaction });
    if (!booking) return { action: "ignored" };

    const previous = { checkIn: booking.checkIn, checkOut: booking.checkOut };
    if (booking.bookingStatus !== "cancelled") {
      const old = booking.bookingStatus;
      await booking.update({ bookingStatus: "cancelled" }, { transaction });
      await freeCalendarRows(booking.id, transaction);
      await logChange(booking.id, `OTA booking cancelled via Beds24 (${b.channel})`, old, "cancelled", transaction);
    }
    await existingMap.update({ lastStatus: b.status, lastModified: b.modified }, { transaction });
    return { action: "cancelled", booking, previous };
  }

  // Only confirmed reservations hold a dome. "request", "inquiry" and "black"
  // (a manual block in Beds24) are left alone and reported by the caller.
  if (!ACTIVE_STATUSES.includes(b.status)) return { action: "ignored" };

  if (!b.checkIn || !b.checkOut || b.checkIn >= b.checkOut) {
    throw new Error(`Beds24 booking ${b.id} has invalid dates (${b.checkIn} to ${b.checkOut})`);
  }

  let booking = existingMap?.bookingId
    ? await db.Booking.findByPk(existingMap.bookingId, { transaction })
    : null;
  let action;
  let previous = null;

  if (!booking) {
    // Past stays are not worth importing on the first sync.
    if (b.checkOut < toYmd(new Date())) return { action: "ignored" };

    booking = await createFromBeds24(b, transaction);
    action = "created";
  } else {
    previous = { checkIn: booking.checkIn, checkOut: booking.checkOut };
    const old = booking.bookingStatus;
    await booking.update(
      {
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        totalPrice: b.price,
        guestsCount: b.adults + b.children,
        bookingStatus: old === "cancelled" ? "confirmed_unassigned" : old,
      },
      { transaction },
    );
    await freeCalendarRows(booking.id, transaction);
    action = "modified";
  }

  // The reservation already exists at the OTA, so it is never refused. If it
  // takes the pool over capacity, leave it unassigned and flag it for staff.
  const overbooked = await stayIsOversold(b.checkIn, b.checkOut, transaction);
  if (!overbooked) {
    await markCalendarRows(booking.id, b.checkIn, b.checkOut, booking.podId, transaction);
  }

  await logChange(
    booking.id,
    overbooked
      ? `OVERBOOKED: OTA booking ${action === "created" ? "imported" : "changed"} via Beds24 (${b.channel}) with no free dome for these dates. Re-allocate or relocate the guest.`
      : action === "created"
        ? `OTA booking imported from ${b.channel} via Beds24`
        : `OTA booking modified via Beds24 (${b.channel})`,
    action === "created" ? null : booking.bookingStatus,
    booking.bookingStatus,
    transaction,
  );

  const mapData = {
    bookingId: booking.id,
    beds24BookingId: b.id,
    channel: b.channel,
    apiReference: b.apiReference,
    lastStatus: b.status,
    lastModified: b.modified,
  };
  if (existingMap) await existingMap.update(mapData, { transaction });
  else await db.Beds24BookingMap.create({ id: uuidv4(), ...mapData }, { transaction });

  return { action, booking, overbooked, previous };
}

async function processBooking(raw) {
  const b = extractBooking(raw);
  let outcome = null;

  await withAdvisoryLock(db.sequelize, INVENTORY_LOCK_KEY, async (transaction) => {
    outcome = await applyBooking(b, transaction);
  });

  const { action, booking, overbooked, previous } = outcome;

  if (booking && ["created", "modified", "cancelled"].includes(action)) {
    // Re-push the new dates and, when they moved, the old ones too.
    const from = [previous?.checkIn, booking.checkIn].filter(Boolean).map(ymd).sort()[0];
    const to = [previous?.checkOut, booking.checkOut].filter(Boolean).map(ymd).sort().pop();
    triggerAriPushForStay(from, to).catch((err) =>
      console.error("[Beds24] Post-import availability push failed:", err.message),
    );
  }

  // One alert per overbooked change: the stored modified time stops a repeat.
  if (overbooked && booking && emailConfig.isConfigured() && emailConfig.adminEmail) {
    emailService
      .sendEmail({
        to: emailConfig.adminEmail,
        subject: `OVERBOOKED: ${b.channel} booking ${booking.bookingReference}`,
        html: `<p>${b.channel} reservation ${b.id} (${booking.bookingReference}) for ${b.checkIn} to ${b.checkOut} was imported, but no dome is free on those dates.</p><p>Re-allocate it or relocate the guest.</p>`,
      })
      .catch(() => {});
  }

  return { beds24Id: b.id, status: b.status, action, bookingId: booking?.id, overbooked: Boolean(overbooked) };
}

function alertImportFailures(failures) {
  if (!emailConfig.isConfigured() || !emailConfig.adminEmail) return;
  if (Date.now() - lastFailureEmailAt < FAILURE_EMAIL_INTERVAL_MS) return;
  lastFailureEmailAt = Date.now();
  emailService
    .sendEmail({
      to: emailConfig.adminEmail,
      subject: "Beds24 booking import failed",
      html: `<p>${failures.length} Beds24 booking(s) could not be imported and will be retried:</p><pre>${JSON.stringify(failures, null, 2)}</pre>`,
    })
    .catch(() => {});
}

async function pullBookings() {
  if (!beds24Service.isConfigured()) {
    return { skipped: true, reason: "Beds24 not configured", processed: 0 };
  }

  const last = await getLastSuccessful(SYNC_PULL);
  const startedAt = new Date();
  const since = last?.result?.pulledUntil
    ? new Date(new Date(last.result.pulledUntil).getTime() - beds24Config.pullOverlapMinutes * 60 * 1000)
    : new Date(startedAt.getTime() - INITIAL_PULL_DAYS * 24 * 60 * 60 * 1000);

  const rows = await beds24Service.getBookingsModifiedSince(since.toISOString());
  const results = [];
  const failures = [];
  const skippedStatuses = {};

  for (const raw of rows) {
    try {
      const r = await processBooking(raw);
      results.push(r);
      if (r.action === "ignored") {
        const s = String(raw.status || "unknown").toLowerCase();
        skippedStatuses[s] = (skippedStatuses[s] || 0) + 1;
      }
    } catch (err) {
      console.error(`[Beds24] Failed to process booking ${raw?.id}:`, err.message);
      failures.push({ beds24Id: raw?.id, error: err.message });
    }
  }

  if (failures.length) alertImportFailures(failures);

  return {
    fetched: rows.length,
    processed: results.length,
    created: results.filter((r) => r.action === "created").length,
    modified: results.filter((r) => r.action === "modified").length,
    cancelled: results.filter((r) => r.action === "cancelled").length,
    overbooked: results.filter((r) => r.overbooked).length,
    ignoredByStatus: skippedStatuses,
    failures,
    // Hold the window open when something failed so it is read again next time.
    pulledUntil: failures.length
      ? last?.result?.pulledUntil || since.toISOString()
      : startedAt.toISOString(),
  };
}

async function triggerBookingPull() {
  const { entry, skipped } = await enqueueSync({
    syncType: SYNC_PULL,
    idempotencyKey: `${SYNC_PULL}:${Date.now()}`,
    payload: {},
  });
  if (skipped) return { skipped: true };

  try {
    await markProcessing(entry);
    const result = await pullBookings();
    await markSuccess(entry, result);
    return result;
  } catch (err) {
    await markFailed(entry, err);
    throw err;
  }
}

module.exports = {
  extractBooking,
  applyBooking,
  processBooking,
  pullBookings,
  triggerBookingPull,
  SYNC_PULL,
};
