const db = require("../models");

const DEFAULT_PRICING_CONFIG = {
  id: 1,
  basePricePerPod: 400000,
  extraGuestFee: 100000,
  basePricePerPodOffPeak: 325000,
  basePricePerPodPeak: 400000,
  extraGuestFeeOffPeak: 100000,
  extraGuestFeePeak: 100000,
  maxGuestsPerPod: 2,
  minGuestsPerPod: 1,
  totalPodsAvailable: 6,
  twelveGuestDiscountPercent: 10,
  currency: "NGN",
};

/**
 * Load pricing configuration row from DB (same source as GET /config/pricing).
 * @returns {Promise<{ config: object, source: 'database' | 'default' }>}
 */
async function loadPricingConfigurationFromDb() {
  try {
    const config = await db.PricingConfiguration.findByPk(1);
    if (config) {
      return { config, source: "database" };
    }
  } catch (err) {
    console.warn("[pricing] DB config load failed:", err.message);
  }
  return { config: DEFAULT_PRICING_CONFIG, source: "default" };
}

/**
 * Load active seasonal peak rate periods from DB.
 * @returns {Promise<{ rates: object[], source: 'database' | 'empty' }>}
 */
async function loadSeasonalRatesFromDb() {
  try {
    const rows = await db.PeakRate.findAll({ where: { isActive: true } });
    return {
      rates: rows.map((r) => ({
        startDate: r.startDate,
        endDate: r.endDate,
        percentageAdjustment: Number(r.percentageAdjustment),
        isActive: r.isActive,
      })),
      source: rows.length ? "database" : "empty",
    };
  } catch (err) {
    console.warn("[pricing] DB seasonal rates load failed:", err.message);
    return { rates: [], source: "empty" };
  }
}

module.exports = {
  DEFAULT_PRICING_CONFIG,
  loadPricingConfigurationFromDb,
  loadSeasonalRatesFromDb,
};
