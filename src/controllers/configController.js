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
        twelveGuestDiscountPercent: 10,
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
      twelve_guest_discount_percent:
        config.twelveGuestDiscountPercent != null
          ? Number(config.twelveGuestDiscountPercent)
          : 10,
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
      twelve_guest_discount_percent,
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
        twelveGuestDiscountPercent: twelve_guest_discount_percent,
        currency,
      });
    } else {
      config.basePricePerPod = base_price_per_pod;
      config.extraGuestFee = extra_guest_fee;
      config.maxGuestsPerPod = max_guests_per_pod;
      config.minGuestsPerPod = min_guests_per_pod;
      config.totalPodsAvailable = total_pods_available;
      config.twelveGuestDiscountPercent = twelve_guest_discount_percent;
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
      twelve_guest_discount_percent:
        config.twelveGuestDiscountPercent != null
          ? Number(config.twelveGuestDiscountPercent)
          : 10,
      currency: config.currency,
    });
  } catch (err) {
    next(err);
  }
}

async function getSchoolHolidays(req, res, next) {
  try {
    const holidays = await db.SchoolHoliday.findAll({
      order: [["startDate", "ASC"]],
    });
    res.json(holidays);
  } catch (err) {
    next(err);
  }
}

async function createSchoolHoliday(req, res, next) {
  try {
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: "Name, startDate, and endDate are required" });
    }
    const holiday = await db.SchoolHoliday.create({ name, startDate, endDate });
    res.status(201).json(holiday);
  } catch (err) {
    next(err);
  }
}

async function updateSchoolHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const { name, startDate, endDate } = req.body;
    const holiday = await db.SchoolHoliday.findByPk(id);
    if (!holiday) return res.status(404).json({ error: "Holiday not found" });
    
    await holiday.update({ name, startDate, endDate });
    res.json(holiday);
  } catch (err) {
    next(err);
  }
}

async function deleteSchoolHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const holiday = await db.SchoolHoliday.findByPk(id);
    if (!holiday) return res.status(404).json({ error: "Holiday not found" });
    
    await holiday.destroy();
    res.json({ message: "Holiday deleted successfully" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPricingConfiguration,
  updatePricingConfiguration,
  getSchoolHolidays,
  createSchoolHoliday,
  updateSchoolHoliday,
  deleteSchoolHoliday,
};
