/**
 * ARI (Availability, Rates, Inventory) sync to Channex.
 */
const channexConfig = require("../config/channexConfig");
const channexService = require("./channexService");
const {
  computeAvailabilityMap,
  getPricingConfigOrDefault,
} = require("./inventoryService");
const {
  enqueueSync,
  markProcessing,
  markSuccess,
  markFailed,
} = require("./channexSyncOutbox");
const db = require("../models");
const {
  iterStayNights,
  toYmd,
  isWeekdayPeakNight,
  getSeasonalPercentForDate,
} = require("../utils/weekdayPeakPricing");
const { getNightRatesFromConfig } = require("../utils/pricingRates");

function addDays(ymd, days) {
  const d = new Date(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

function todayYmd() {
  return toYmd(new Date());
}

/**
 * Compute nightly rates for 1 and 2 adult occupancy (ex-VAT by default).
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

  const nights = iterStayNights(dateFrom, dateTo);
  const map = {};
  const vatDivisor = channexConfig.ratesExVat ? 1 + channexConfig.vatRate : 1;

  for (const night of nights) {
    const ymd = toYmd(night);
    const isPeak = isWeekdayPeakNight(night);
    const { basePerPod, extraGuestFee } = getNightRatesFromConfig(config, isPeak);
    const seasonalPct = getSeasonalPercentForDate(ymd, seasonal);
    const multiplier = 1 + seasonalPct / 100;

    const occ1 = (basePerPod * multiplier) / vatDivisor;
    const occ2 = ((basePerPod + extraGuestFee) * multiplier) / vatDivisor;

    map[ymd] = {
      occupancy1: Math.round(occ1 * 100) / 100,
      occupancy2: Math.round(occ2 * 100) / 100,
      isPeak,
      seasonalPct,
    };
  }

  return map;
}

/**
 * Preview combined ARI data for admin UI.
 */
async function previewAri({ dateFrom, dateTo } = {}) {
  const from = dateFrom || todayYmd();
  const to =
    dateTo ||
    addDays(from, Math.min(channexConfig.ariWindowDays, 30) - 1);

  const [{ map: availability }, rates] = await Promise.all([
    computeAvailabilityMap(from, to),
    computeRatesMap(from, to),
  ]);

  const dates = Object.keys(availability).sort();
  return dates.map((date) => ({
    date,
    availability: availability[date],
    rateOcc1: rates[date]?.occupancy1 ?? null,
    rateOcc2: rates[date]?.occupancy2 ?? null,
    isPeak: rates[date]?.isPeak ?? false,
  }));
}

function groupConsecutiveDates(dates, getValue) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const groups = [];
  let start = sorted[0];
  let prev = sorted[0];
  let prevVal = getValue(sorted[0]);

  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i];
    const val = getValue(d);
    const expectedNext = addDays(prev, 1);

    if (d === expectedNext && val === prevVal) {
      prev = d;
    } else {
      groups.push({ dateFrom: start, dateTo: prev, value: prevVal });
      start = d;
      prev = d;
      prevVal = val;
    }
  }
  groups.push({ dateFrom: start, dateTo: prev, value: prevVal });
  return groups;
}

function buildAvailabilityPayload(availabilityMap) {
  const dates = Object.keys(availabilityMap);
  const groups = groupConsecutiveDates(dates, (d) => availabilityMap[d]);

  return groups.map((g) => ({
    property_id: channexConfig.propertyId,
    room_type_id: channexConfig.roomTypeId,
    date_from: g.dateFrom,
    date_to: g.dateTo,
    availability: g.value,
  }));
}

function buildRatesPayload(ratesMap) {
  const dates = Object.keys(ratesMap);
  const groups = groupConsecutiveDates(dates, (d) => {
    const r = ratesMap[d];
    return `${r.occupancy1}|${r.occupancy2}`;
  });

  return groups.map((g) => {
    const [occ1, occ2] = g.value.split("|").map(Number);
    return {
      property_id: channexConfig.propertyId,
      rate_plan_id: channexConfig.ratePlanId,
      date_from: g.dateFrom,
      date_to: g.dateTo,
      rates: [
        { occupancy: 1, rate: channexService.toChannexRate(occ1) },
        { occupancy: 2, rate: channexService.toChannexRate(occ2) },
      ],
      min_stay: channexConfig.minStay,
    };
  });
}

async function pushAriToChannex({ dateFrom, dateTo, syncLogEntry } = {}) {
  if (!channexService.isConfigured()) {
    return { skipped: true, reason: "Channex not configured" };
  }

  const from = dateFrom || todayYmd();
  const to =
    dateTo || addDays(from, channexConfig.ariWindowDays - 1);

  const [{ map: availability }, rates] = await Promise.all([
    computeAvailabilityMap(from, to),
    computeRatesMap(from, to),
  ]);

  const availValues = buildAvailabilityPayload(availability);
  const rateValues = buildRatesPayload(rates);

  const results = { availability: null, rates: null, warnings: [] };

  if (availValues.length) {
    results.availability = await channexService.pushAvailability(availValues);
    if (results.availability?.meta?.warnings?.length) {
      results.warnings.push(...results.availability.meta.warnings);
    }
  }

  if (rateValues.length) {
    results.rates = await channexService.pushRestrictions(rateValues);
    if (results.rates?.meta?.warnings?.length) {
      results.warnings.push(...results.rates.meta.warnings);
    }
  }

  if (syncLogEntry) {
    await markSuccess(syncLogEntry, {
      dateFrom: from,
      dateTo: to,
      availChunks: availValues.length,
      rateChunks: rateValues.length,
      warnings: results.warnings.length,
    });
  }

  return {
    success: true,
    dateFrom: from,
    dateTo: to,
    availChunks: availValues.length,
    rateChunks: rateValues.length,
    warnings: results.warnings,
  };
}

/**
 * Enqueue and execute an ARI push (full window or date range).
 */
async function triggerAriPush({ dateFrom, dateTo, idempotencyKey } = {}) {
  if (!channexConfig.enabled) {
    return { skipped: true, reason: "Channex disabled" };
  }

  const key =
    idempotencyKey ||
    `ari-push:${dateFrom || "full"}:${dateTo || "full"}:${Date.now()}`;

  const { entry, skipped } = await enqueueSync({
    syncType: "push-ari",
    payload: { dateFrom, dateTo },
    idempotencyKey: key,
  });

  if (skipped) return { skipped: true, entryId: entry.id };

  try {
    await markProcessing(entry);
    const result = await pushAriToChannex({
      dateFrom,
      dateTo,
      syncLogEntry: entry,
    });
    return { ...result, entryId: entry.id };
  } catch (err) {
    await markFailed(entry, err);
    throw err;
  }
}

/**
 * Event-driven: re-push ARI for affected stay dates (+/- 1 day buffer).
 */
async function triggerAriPushForStay(checkIn, checkOut) {
  const nights = iterStayNights(checkIn, checkOut);
  if (!nights.length) return { skipped: true };

  const dateFrom = toYmd(nights[0]);
  const dateTo = toYmd(nights[nights.length - 1]);
  const idempotencyKey = `ari-stay:${dateFrom}:${dateTo}:${Date.now()}`;

  return triggerAriPush({ dateFrom, dateTo, idempotencyKey });
}

/**
 * Reconciliation: compare local vs Channex availability for a sample window.
 */
async function reconcileAvailability({ dateFrom, dateTo } = {}) {
  if (!channexService.isConfigured()) {
    return { skipped: true, reason: "Channex not configured" };
  }

  const from = dateFrom || todayYmd();
  const to = dateTo || addDays(from, 14);

  const [{ map: local }, remote] = await Promise.all([
    computeAvailabilityMap(from, to),
    channexService.getAvailability({ dateFrom: from, dateTo: to }),
  ]);

  const remoteMap =
    remote?.data?.[channexConfig.roomTypeId] || remote?.data || {};

  const drifts = [];
  for (const [date, localAvail] of Object.entries(local)) {
    const remoteAvail = remoteMap[date];
    if (remoteAvail !== undefined && remoteAvail !== localAvail) {
      drifts.push({ date, local: localAvail, remote: remoteAvail });
    }
  }

  return { from, to, drifts, driftCount: drifts.length };
}

module.exports = {
  computeRatesMap,
  previewAri,
  pushAriToChannex,
  triggerAriPush,
  triggerAriPushForStay,
  reconcileAvailability,
};
