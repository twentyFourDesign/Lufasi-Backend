/**
 * Import OTA reservations from Channex booking revision feed.
 */
const { v4: uuidv4 } = require("uuid");
const db = require("../models");
const channexService = require("./channexService");
const channexConfig = require("../config/channexConfig");
const { triggerAriPushForStay } = require("./channexAriService");
const {
  enqueueSync,
  markProcessing,
  markSuccess,
  markFailed,
} = require("./channexSyncOutbox");
const { withAdvisoryLock, INVENTORY_LOCK_KEY } = require("../utils/advisoryLock");
const { hasCapacityForStay } = require("./inventoryService");
const emailService = require("./emailService");
const emailConfig = require("../config/emailConfig");

function genOtaRef(otaCode) {
  const suffix = (otaCode || "OTA").slice(-6).toUpperCase();
  return `LUF-${suffix}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

function extractRevisionData(raw) {
  const rev = raw?.data?.attributes || raw?.attributes || raw;
  return {
    id: raw?.data?.id || raw?.id,
    bookingId: rev.booking_id,
    uniqueId: rev.unique_id,
    systemId: rev.system_id,
    otaReservationCode: rev.ota_reservation_code,
    otaName: rev.ota_name || "booking.com",
    status: rev.status,
    checkIn: rev.arrival_date,
    checkOut: rev.departure_date,
    amount: Number(rev.amount) || 0,
    currency: rev.currency || "NGN",
    customer: rev.customer || {},
    occupancy: rev.occupancy || { adults: 1, children: 0, infants: 0 },
    rooms: rev.rooms || [],
    notes: rev.notes || "",
  };
}

async function findExistingMap(revision) {
  if (revision.systemId) {
    const bySystem = await db.ChannexBookingMap.findOne({
      where: { revisionSystemId: revision.systemId },
    });
    if (bySystem) return bySystem;
  }

  if (revision.uniqueId) {
    return db.ChannexBookingMap.findOne({
      where: { uniqueId: revision.uniqueId },
    });
  }

  if (revision.otaReservationCode) {
    return db.ChannexBookingMap.findOne({
      where: { otaReservationCode: revision.otaReservationCode },
    });
  }

  return null;
}

async function createCalendarRows(bookingId, checkIn, checkOut, podId, transaction) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    await db.CalendarAvailability.create(
      {
        podId,
        date: dateStr,
        status: "booked",
        bookingId,
      },
      { transaction },
    ).catch(() => {});
  }
}

async function freeCalendarRows(bookingId, transaction) {
  await db.CalendarAvailability.destroy({
    where: { bookingId },
    transaction,
  });
}

async function resolveDefaultPodId(transaction) {
  const pod = await db.Pod.findOne({
    where: { isDeleted: false, isActive: true },
    order: [["podName", "ASC"]],
    transaction,
  });
  return pod?.id || null;
}

async function processNewOrModifiedRevision(revision, transaction) {
  const podsRequested = Math.max(
    1,
    revision.rooms?.length || 1,
  );
  const adults = revision.occupancy?.adults || 1;
  const children = revision.occupancy?.children || 0;

  const existingMap = await findExistingMap(revision);
  let booking = null;
  let overbooked = false;

  if (existingMap?.bookingId) {
    booking = await db.Booking.findByPk(existingMap.bookingId, { transaction });
  }

  if (!booking) {
    const capacityOk = await hasCapacityForStay(
      {
        checkIn: revision.checkIn,
        checkOut: revision.checkOut,
        podsRequested,
      },
      { transaction },
    );

    // The guest already holds a confirmed OTA reservation, so never refuse the
    // import. Record it, flag it, and let staff re-allocate or relocate.
    if (!capacityOk) {
      overbooked = true;
      console.warn(
        `[Channex] OTA booking ${revision.otaReservationCode} imported with no free dome (${revision.checkIn} to ${revision.checkOut})`,
      );
    }

    const podId = await resolveDefaultPodId(transaction);
    if (!podId) throw new Error("No active pod found for OTA booking import");

    const guestEmail =
      revision.customer?.mail ||
      revision.customer?.email ||
      `ota-${uuidv4().slice(0, 8)}@import.lufasi.local`;

    const guestDir = await db.GuestDirectory.create(
      {
        id: uuidv4(),
        fullName:
          [revision.customer?.name, revision.customer?.surname]
            .filter(Boolean)
            .join(" ") || "OTA Guest",
        email: guestEmail,
        phone: revision.customer?.phone || "",
      },
      { transaction },
    );

    booking = await db.Booking.create(
      {
        id: uuidv4(),
        bookingReference: genOtaRef(revision.otaReservationCode),
        guestDirectoryId: guestDir.id,
        podId,
        checkIn: revision.checkIn,
        checkOut: revision.checkOut,
        totalPrice: revision.amount,
        bookingStatus: "confirmed_unassigned",
        bookingSource: revision.otaName || "booking.com",
        boardType: "fullBoard",
        podCount: podsRequested,
        podsCount: podsRequested,
        guestsCount: adults + children + (revision.occupancy?.infants || 0),
        configCurrency: revision.currency,
        expiresAt: null,
      },
      { transaction },
    );

    await db.BookingGuest.create(
      {
        id: uuidv4(),
        bookingId: booking.id,
        adults,
        children,
        toddlers: 0,
        infants: revision.occupancy?.infants || 0,
      },
      { transaction },
    );

    await createCalendarRows(
      booking.id,
      revision.checkIn,
      revision.checkOut,
      podId,
      transaction,
    );

    await db.BookingLog.create(
      {
        id: uuidv4(),
        bookingId: booking.id,
        action: overbooked
          ? `OVERBOOKED: OTA booking imported from ${revision.otaName} via Channex with no free dome for these dates. Re-allocate or relocate the guest.`
          : `OTA booking imported from ${revision.otaName} via Channex`,
        oldStatus: null,
        newStatus: "confirmed_unassigned",
      },
      { transaction },
    );
  } else {
    await booking.update(
      {
        checkIn: revision.checkIn,
        checkOut: revision.checkOut,
        totalPrice: revision.amount,
        podCount: podsRequested,
        podsCount: podsRequested,
        guestsCount: adults + children + (revision.occupancy?.infants || 0),
        bookingStatus:
          booking.bookingStatus === "cancelled"
            ? "confirmed_unassigned"
            : booking.bookingStatus,
      },
      { transaction },
    );

    await freeCalendarRows(booking.id, transaction);
    await createCalendarRows(
      booking.id,
      revision.checkIn,
      revision.checkOut,
      booking.podId,
      transaction,
    );

    await db.BookingLog.create(
      {
        id: uuidv4(),
        bookingId: booking.id,
        action: `OTA booking modified via Channex (${revision.otaName})`,
        oldStatus: booking.bookingStatus,
        newStatus: booking.bookingStatus,
      },
      { transaction },
    );
  }

  const mapData = {
    bookingId: booking.id,
    channexBookingId: revision.bookingId,
    channexRevisionId: revision.id,
    uniqueId: revision.uniqueId,
    otaReservationCode: revision.otaReservationCode,
    revisionSystemId: revision.systemId,
    otaName: revision.otaName,
    source: revision.otaName || "booking.com",
    lastRevisionStatus: revision.status,
  };

  if (existingMap) {
    await existingMap.update(mapData, { transaction });
  } else {
    await db.ChannexBookingMap.create({ id: uuidv4(), ...mapData }, { transaction });
  }

  return { booking, overbooked };
}

async function processCancelledRevision(revision, transaction) {
  const existingMap = await findExistingMap(revision);
  if (!existingMap?.bookingId) return null;

  const booking = await db.Booking.findByPk(existingMap.bookingId, {
    transaction,
  });
  if (!booking) return null;

  const oldStatus = booking.bookingStatus;
  await booking.update({ bookingStatus: "cancelled" }, { transaction });
  await freeCalendarRows(booking.id, transaction);

  await db.BookingLog.create(
    {
      id: uuidv4(),
      bookingId: booking.id,
      action: `OTA booking cancelled via Channex (${revision.otaName})`,
      oldStatus,
      newStatus: "cancelled",
    },
    { transaction },
  );

  await existingMap.update(
    { lastRevisionStatus: "cancelled", channexRevisionId: revision.id },
    { transaction },
  );

  return booking;
}

async function processRevision(rawRevision) {
  const revision = extractRevisionData(rawRevision);

  if (!revision.id) {
    return { skipped: true, reason: "No revision id" };
  }

  if (revision.systemId) {
    const processed = await db.ChannexSyncLog.findOne({
      where: {
        idempotencyKey: `revision:${revision.systemId}`,
        status: "success",
      },
    });
    if (processed) {
      await channexService.acknowledgeBookingRevision(revision.id).catch(() => {});
      return { skipped: true, reason: "Already processed" };
    }
  }

  let booking = null;
  let overbooked = false;

  await withAdvisoryLock(db.sequelize, INVENTORY_LOCK_KEY, async (transaction) => {
    if (revision.status === "cancelled") {
      booking = await processCancelledRevision(revision, transaction);
    } else {
      const imported = await processNewOrModifiedRevision(revision, transaction);
      booking = imported.booking;
      overbooked = imported.overbooked;
    }
  });

  await channexService.acknowledgeBookingRevision(revision.id);

  if (revision.systemId) {
    await enqueueSync({
      syncType: "import-booking",
      idempotencyKey: `revision:${revision.systemId}`,
      payload: { revisionId: revision.id, status: revision.status },
    }).then(async ({ entry }) => {
      await markProcessing(entry);
      await markSuccess(entry, { bookingId: booking?.id });
    });
  }

  if (booking) {
    triggerAriPushForStay(booking.checkIn, booking.checkOut).catch((err) => {
      console.error("[Channex] Post-import ARI push failed:", err.message);
    });
  }

  // One alert per overbooked import: the revision is acknowledged above, so it
  // is not pulled (or emailed) again.
  if (overbooked && booking && emailConfig.isConfigured() && emailConfig.adminEmail) {
    emailService
      .sendEmail({
        to: emailConfig.adminEmail,
        subject: `OVERBOOKED: ${revision.otaName} booking ${booking.bookingReference}`,
        html: `<p>${revision.otaName} reservation ${revision.otaReservationCode} (${booking.bookingReference}) for ${revision.checkIn} to ${revision.checkOut} was imported, but no dome is free on those dates.</p><p>Re-allocate it or relocate the guest.</p>`,
      })
      .catch(() => {});
  }

  return { success: true, bookingId: booking?.id, status: revision.status };
}

async function pullBookingFeed() {
  if (!channexService.isConfigured()) {
    return { skipped: true, reason: "Channex not configured", processed: 0 };
  }

  const feed = await channexService.getBookingRevisionFeed();
  const revisions = feed?.data || [];

  if (!revisions.length) {
    return { processed: 0, message: "No pending revisions" };
  }

  const results = [];
  for (const rev of revisions) {
    try {
      const result = await processRevision(rev);
      results.push(result);
    } catch (err) {
      console.error(
        `[Channex] Failed to process revision ${rev?.id}:`,
        err.message,
      );
      results.push({ error: err.message, revisionId: rev?.id });

      if (emailConfig.isConfigured() && emailConfig.adminEmail) {
        emailService
          .sendEmail({
            to: emailConfig.adminEmail,
            subject: "Channex booking import failed",
            html: `<p>Revision ${rev?.id}: ${err.message}</p>`,
          })
          .catch(() => {});
      }
    }
  }

  return { processed: results.length, results };
}

async function triggerBookingPull() {
  const { entry, skipped } = await enqueueSync({
    syncType: "pull-bookings",
    idempotencyKey: `pull-bookings:${Date.now()}`,
    payload: {},
  });

  if (skipped) return { skipped: true };

  try {
    await markProcessing(entry);
    const result = await pullBookingFeed();
    await markSuccess(entry, result);
    return result;
  } catch (err) {
    await markFailed(entry, err);
    throw err;
  }
}

module.exports = {
  extractRevisionData,
  processRevision,
  pullBookingFeed,
  triggerBookingPull,
};
