/**
 * Weekday peak: Friday & Saturday. Off-peak: Sunday–Thursday.
 * Seasonal date ranges (peak_rates table) apply per night as % on top of nightly rates.
 */

const { getNightRatesFromConfig } = require("./pricingRates");

function parseLocalDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    return new Date(
      dateInput.getFullYear(),
      dateInput.getMonth(),
      dateInput.getDate(),
    );
  }
  const str = String(dateInput).slice(0, 10);
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Friday = 5, Saturday = 6 */
function isWeekdayPeakNight(date) {
  const day = date.getDay();
  return day === 5 || day === 6;
}

function iterStayNights(checkIn, checkOut) {
  const start = parseLocalDate(checkIn);
  const end = parseLocalDate(checkOut);
  if (!start || !end || start >= end) return [];

  const nights = [];
  const cur = new Date(start);
  while (cur < end) {
    nights.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return nights;
}

function getSeasonalPercentForDate(dateYmd, seasonalRates) {
  if (!seasonalRates?.length) return 0;

  let best = null;
  for (const rate of seasonalRates) {
    if (rate.isActive === false) continue;
    if (rate.startDate <= dateYmd && rate.endDate >= dateYmd) {
      const pct = Number(rate.percentageAdjustment) || 0;
      if (
        !best ||
        Math.abs(pct) > Math.abs(Number(best.percentageAdjustment))
      ) {
        best = rate;
      }
    }
  }
  return best ? Number(best.percentageAdjustment) : 0;
}

function getWeekdayPeakInfoFromConfig() {
  return {
    peakDaysLabel: "Friday & Saturday",
    offPeakDaysLabel: "Sunday – Thursday",
  };
}

/**
 * Per-night room subtotal (base + extra guests), before extras add-ons.
 * @param {object} pricingConfig - pricing configuration row or plain object
 */
function calculateStayRoomSubtotal({
  checkIn,
  checkOut,
  podsCount,
  guestsCount,
  pricingConfig = {},
  seasonalRates = [],
}) {
  const pods = podsCount < 1 ? 1 : podsCount;
  const totalGuests = guestsCount < 1 ? 1 : guestsCount;
  const extraGuests = totalGuests > pods ? totalGuests - pods : 0;

  const nights = iterStayNights(checkIn, checkOut);
  if (!nights.length) {
    return {
      subtotal: 0,
      nights: 0,
      peakNights: 0,
      offPeakNights: 0,
      nightBreakdown: [],
    };
  }

  let subtotal = 0;
  let baseForStay = 0;
  let extraForStay = 0;
  let peakNights = 0;
  let offPeakNights = 0;
  const nightBreakdown = [];

  for (const nightDate of nights) {
    const ymd = toYmd(nightDate);
    const isPeak = isWeekdayPeakNight(nightDate);
    const { basePerPod, extraGuestFee } = getNightRatesFromConfig(
      pricingConfig,
      isPeak,
    );
    const seasonalPct = getSeasonalPercentForDate(ymd, seasonalRates);
    const multiplier = 1 + seasonalPct / 100;

    const nightBase = pods * basePerPod * multiplier;
    const nightExtra = extraGuests * extraGuestFee * multiplier;
    const nightTotal = nightBase + nightExtra;

    subtotal += nightTotal;
    baseForStay += nightBase;
    extraForStay += nightExtra;
    if (isPeak) peakNights += 1;
    else offPeakNights += 1;

    nightBreakdown.push({
      date: ymd,
      isPeak,
      basePerPod,
      extraGuestFee,
      seasonalPercent: seasonalPct,
      multiplier,
      nightTotal,
    });
  }

  return {
    subtotal,
    baseForStay,
    extraForStay,
    nights: nights.length,
    peakNights,
    offPeakNights,
    nightBreakdown,
  };
}

module.exports = {
  parseLocalDate,
  toYmd,
  isWeekdayPeakNight,
  iterStayNights,
  getSeasonalPercentForDate,
  getWeekdayPeakInfoFromConfig,
  calculateStayRoomSubtotal,
};
