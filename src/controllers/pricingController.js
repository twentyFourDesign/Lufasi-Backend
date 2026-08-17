const { resolvePodAllocation } = require("../utils/guestAllocation");
const { normalizeFamilyGuests, isFamilyCompositionAllowed } = require("../utils/familyRules");
const {
  mergePricingConfig,
  normalizeExtras,
  buildPricingQuote,
} = require("../utils/pricingQuote");
const {
  loadPricingConfigurationFromDb,
  loadSeasonalRatesFromDb,
} = require("../utils/pricingConfigLoader");

/**
 * POST /pricing/quote
 * Real-time room pricing. Uses admin DB rates by default (omit pricingConfig in body).
 */
async function quotePricing(req, res, next) {
  try {
    const {
      checkIn,
      checkOut,
      startDate,
      endDate,
      podsCount,
      rooms,
      pods,
      guests = {},
      podAllocation: podAllocationBody,
      domeDetails = [],
      extras = [],
      alcoholPackageIncluded = true,
      pricingConfig: pricingConfigOverride,
      seasonalRates: seasonalRatesOverride,
      applyTwelveGuestDiscount = true,
      includeNightBreakdown = true,
    } = req.body || {};

    const checkInDate = checkIn || startDate;
    const checkOutDate = checkOut || endDate;
    const podCount = Number(podsCount ?? rooms ?? pods ?? 1);

    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        error: "checkIn and checkOut are required (aliases: startDate, endDate).",
      });
    }
    if (!Number.isFinite(podCount) || podCount < 1) {
      return res.status(400).json({ error: "podsCount must be at least 1." });
    }

    const guestCounts = normalizeFamilyGuests(guests);
    if (!isFamilyCompositionAllowed(guestCounts, podCount)) {
      return res.status(400).json({
        error:
          "This guest combination cannot be accommodated in the selected number of domes.",
      });
    }

    const hasConfigOverride =
      pricingConfigOverride != null &&
      typeof pricingConfigOverride === "object" &&
      Object.keys(pricingConfigOverride).length > 0;
    const hasSeasonalOverride = Array.isArray(seasonalRatesOverride);

    const [{ config: dbConfig, source: configSource }, seasonalFromDb] =
      await Promise.all([
        loadPricingConfigurationFromDb(),
        hasSeasonalOverride
          ? Promise.resolve({
              rates: seasonalRatesOverride,
              source: "override",
            })
          : loadSeasonalRatesFromDb(),
      ]);

    const pricingConfig = hasConfigOverride
      ? mergePricingConfig(dbConfig, pricingConfigOverride)
      : dbConfig;

    const normalizedExtras = normalizeExtras(extras);

    let podAllocationOverride = Array.isArray(podAllocationBody)
      ? podAllocationBody
      : null;
    if (!podAllocationOverride && Array.isArray(domeDetails) && domeDetails.length) {
      const resolved = resolvePodAllocation({
        domeDetails,
        guestCounts,
        podsCount: podCount,
      });
      if (!resolved.error) {
        podAllocationOverride = resolved.allocation;
      }
    }

    const quote = buildPricingQuote({
      checkInDate,
      checkOutDate,
      podCount,
      guestCounts,
      pricingConfig,
      seasonalRates: seasonalFromDb.rates,
      normalizedExtras,
      applyTwelveGuestDiscount,
      includeNightBreakdown,
      podAllocation: podAllocationOverride,
      alcoholPackageIncluded,
    });

    res.json({
      ...quote,
      sources: {
        pricingConfig: hasConfigOverride ? "override" : configSource,
        seasonalRates: seasonalFromDb.source,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  quotePricing,
};
