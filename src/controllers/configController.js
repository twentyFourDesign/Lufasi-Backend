const db = require("../models");

async function getPricingConfiguration(req, res, next) {
  try {
    let config = await db.PricingConfiguration.findByPk(1);

    if (!config) {
      config = {
        id: 1,
        basePricePerPod: 400000,
        extraGuestFee: 100000,
        maxGuestsPerPod: 2,
        minGuestsPerPod: 1,
        totalPodsAvailable: 6,
        currency: "NGN",
      };
    }

    res.json({
      id: config.id,
      base_price_per_pod: Number(config.basePricePerPod),
      extra_guest_fee: Number(config.extraGuestFee),
      max_guests_per_pod: config.maxGuestsPerPod,
      min_guests_per_pod: config.minGuestsPerPod,
      total_pods_available: config.totalPodsAvailable,
      currency: config.currency,
    });
  } catch (err) {
    next(err);
  }
}

async function updatePricingConfiguration(req, res, next) {
  try {
    const {
      base_price_per_pod,
      extra_guest_fee,
      max_guests_per_pod,
      min_guests_per_pod,
      total_pods_available,
      currency,
    } = req.body;

    let config = await db.PricingConfiguration.findByPk(1);

    if (!config) {
      config = await db.PricingConfiguration.create({
        id: 1,
        basePricePerPod: base_price_per_pod,
        extraGuestFee: extra_guest_fee,
        maxGuestsPerPod: max_guests_per_pod,
        minGuestsPerPod: min_guests_per_pod,
        totalPodsAvailable: total_pods_available,
        currency,
      });
    } else {
      config.basePricePerPod = base_price_per_pod;
      config.extraGuestFee = extra_guest_fee;
      config.maxGuestsPerPod = max_guests_per_pod;
      config.minGuestsPerPod = min_guests_per_pod;
      config.totalPodsAvailable = total_pods_available;
      config.currency = currency;
      await config.save();
    }

    res.json({
      id: config.id,
      base_price_per_pod: Number(config.basePricePerPod),
      extra_guest_fee: Number(config.extraGuestFee),
      max_guests_per_pod: config.maxGuestsPerPod,
      min_guests_per_pod: config.minGuestsPerPod,
      total_pods_available: config.totalPodsAvailable,
      currency: config.currency,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPricingConfiguration,
  updatePricingConfiguration,
};
