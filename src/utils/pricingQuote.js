const {
  calculateStayRoomSubtotal,
  getWeekdayPeakInfoFromConfig,
} = require("./weekdayPeakPricing");
const { pricingConfigToApi } = require("./pricingRates");
const {
  getBillableGuestCount,
  getDisplayGuestCount,
  isFamilyCompositionAllowed,
} = require("./familyRules");

const TEEN_RATE_MULTIPLIER = 0.75;
const CHILD_RATE_MULTIPLIER = 0.5;
const TODDLER_RATE_MULTIPLIER = 0.25;

function mergePricingConfig(dbConfig, override = {}) {
  const row = dbConfig?.toJSON ? dbConfig.toJSON() : { ...dbConfig };
  const merged = { ...row, ...override };

  if (override.base_price_per_pod != null) {
    merged.basePricePerPod = Number(override.base_price_per_pod);
  }
  if (override.extra_guest_fee != null) {
    merged.extraGuestFee = Number(override.extra_guest_fee);
  }
  if (override.base_price_per_pod_off_peak != null) {
    merged.basePricePerPodOffPeak = Number(override.base_price_per_pod_off_peak);
  }
  if (override.base_price_per_pod_peak != null) {
    merged.basePricePerPodPeak = Number(override.base_price_per_pod_peak);
  }
  if (override.extra_guest_fee_off_peak != null) {
    merged.extraGuestFeeOffPeak = Number(override.extra_guest_fee_off_peak);
  }
  if (override.extra_guest_fee_peak != null) {
    merged.extraGuestFeePeak = Number(override.extra_guest_fee_peak);
  }

  return merged;
}

function normalizeExtras(extras = []) {
  if (!Array.isArray(extras)) return [];
  return extras
    .map((e) => ({
      name: e.name || e.id || "Extra",
      price: Number(e.price) || 0,
      quantity: Number(e.quantity) || 1,
    }))
    .filter((e) => e.price > 0);
}

function buildPricingQuote({
  checkInDate,
  checkOutDate,
  podCount,
  guestCounts,
  pricingConfig,
  seasonalRates,
  normalizedExtras = [],
  applyTwelveGuestDiscount = true,
  includeNightBreakdown = true,
}) {
  const stayPricing = calculateStayRoomSubtotal({
    checkIn: checkInDate,
    checkOut: checkOutDate,
    podsCount: podCount,
    guestCounts,
    pricingConfig,
    seasonalRates,
  });

  const extraAdults = Math.max(0, guestCounts.adults - podCount);
  const extrasTotal = normalizedExtras.reduce(
    (sum, e) => sum + e.price * e.quantity,
    0,
  );

  const roomSubtotal = stayPricing.subtotal;
  const subTotalWithExtras = roomSubtotal + extrasTotal;

  const billableGuests = getBillableGuestCount(guestCounts);
  const displayGuests = getDisplayGuestCount(guestCounts);
  const twelveGuestDiscountPercent =
    applyTwelveGuestDiscount && billableGuests === 12
      ? Number(pricingConfig.twelveGuestDiscountPercent ?? 10)
      : 0;
  const twelveGuestDiscountAmount =
    twelveGuestDiscountPercent > 0
      ? Math.round(stayPricing.baseForStay * (twelveGuestDiscountPercent / 100))
      : 0;

  const subtotalBeforeTax = Math.max(
    0,
    subTotalWithExtras - twelveGuestDiscountAmount,
  );
  const taxAmount = Math.round(subtotalBeforeTax * 0.125);
  const totalWithTax = Math.round(subtotalBeforeTax * 1.125);
  const familyAllowed = isFamilyCompositionAllowed(guestCounts, podCount);

  return {
    inputs: {
      checkIn: checkInDate,
      checkOut: checkOutDate,
      podsCount: podCount,
      guests: guestCounts,
      extras: normalizedExtras,
      billableGuests,
      displayGuests,
      familyCompositionAllowed: familyAllowed,
    },
    ratePolicy: {
      adultReferenceRate: "extraGuestFee (additional adult guest rate per night)",
      teen: {
        ageBand: "13–18",
        discount: "25% off adult guest rate",
        payMultiplier: TEEN_RATE_MULTIPLIER,
      },
      child: {
        ageBand: "4–12",
        discount: "50% off adult guest rate",
        payMultiplier: CHILD_RATE_MULTIPLIER,
      },
      toddler: {
        ageBand: "1–3",
        discount: "75% off adult guest rate",
        payMultiplier: TODDLER_RATE_MULTIPLIER,
      },
      infant: {
        ageBand: "0–1",
        discount: "Free",
        payMultiplier: 0,
      },
    },
    pricingConfigUsed: pricingConfigToApi(pricingConfig),
    weekdayPeakInfo: {
      ...getWeekdayPeakInfoFromConfig(),
      peakNights: stayPricing.peakNights,
      offPeakNights: stayPricing.offPeakNights,
      nights: stayPricing.nights,
    },
    room: {
      baseForStay: stayPricing.baseForStay,
      extraAdults: {
        count: extraAdults,
        total: stayPricing.extraForStay,
      },
      teens: {
        count: guestCounts.teenagers,
        total: stayPricing.teenForStay || 0,
      },
      children: {
        count: guestCounts.children,
        total: stayPricing.childForStay || 0,
      },
      toddlers: {
        count: guestCounts.toddlers,
        total: stayPricing.toddlerForStay || 0,
      },
      infants: {
        count: guestCounts.infants,
        total: 0,
      },
      roomSubtotal: stayPricing.subtotal,
      ...(includeNightBreakdown && stayPricing.nightBreakdown
        ? { nightBreakdown: stayPricing.nightBreakdown }
        : {}),
    },
    extras: {
      items: normalizedExtras,
      total: extrasTotal,
    },
    twelveGuestDiscount: {
      applied: twelveGuestDiscountAmount > 0,
      percent: twelveGuestDiscountPercent,
      amount: twelveGuestDiscountAmount,
      appliesTo: "base pod cost only",
    },
    totals: {
      roomSubtotal,
      extrasTotal,
      subTotal: subTotalWithExtras,
      twelveGuestDiscount: twelveGuestDiscountAmount,
      subtotalBeforeTax,
      taxRate: 0.125,
      taxAmount,
      total: totalWithTax,
      currency: pricingConfig.currency || "NGN",
    },
  };
}

module.exports = {
  TEEN_RATE_MULTIPLIER,
  CHILD_RATE_MULTIPLIER,
  TODDLER_RATE_MULTIPLIER,
  mergePricingConfig,
  normalizeExtras,
  buildPricingQuote,
};
