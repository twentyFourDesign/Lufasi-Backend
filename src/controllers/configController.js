const db = require("../models");
const { pricingConfigToApi } = require("../utils/pricingRates");

function buildPricingResponse(config) {
  const rates = pricingConfigToApi(config);
  return {
    id: config.id ?? 1,
    ...rates,
    max_guests_per_pod: config.maxGuestsPerPod,
    min_guests_per_pod: config.minGuestsPerPod,
    total_pods_available: config.totalPodsAvailable,
    twelve_guest_discount_percent:
      config.twelveGuestDiscountPercent != null
        ? Number(config.twelveGuestDiscountPercent)
        : 10,
    currency: config.currency,
  };
}

async function getPricingConfiguration(req, res, next) {
  try {
    let config = await db.PricingConfiguration.findByPk(1);

    if (!config) {
      config = {
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
    }

    res.json(buildPricingResponse(config));
  } catch (err) {
    next(err);
  }
}

async function updatePricingConfiguration(req, res, next) {
  try {
    const {
      base_price_per_pod_off_peak,
      base_price_per_pod_peak,
      extra_guest_fee_off_peak,
      extra_guest_fee_peak,
      max_guests_per_pod,
      min_guests_per_pod,
      total_pods_available,
      twelve_guest_discount_percent,
      currency,
    } = req.body;

    const offPeakBase = Number(base_price_per_pod_off_peak);
    const peakBase = Number(base_price_per_pod_peak);
    const offPeakExtra = Number(extra_guest_fee_off_peak);
    const peakExtra = Number(extra_guest_fee_peak);

    let config = await db.PricingConfiguration.findByPk(1);

    if (!config) {
      config = await db.PricingConfiguration.create({
        id: 1,
        basePricePerPod: offPeakBase,
        extraGuestFee: offPeakExtra,
        basePricePerPodOffPeak: offPeakBase,
        basePricePerPodPeak: peakBase,
        extraGuestFeeOffPeak: offPeakExtra,
        extraGuestFeePeak: peakExtra,
        maxGuestsPerPod: max_guests_per_pod,
        minGuestsPerPod: min_guests_per_pod,
        totalPodsAvailable: total_pods_available,
        twelveGuestDiscountPercent: twelve_guest_discount_percent,
        currency,
      });
    } else {
      config.basePricePerPodOffPeak = offPeakBase;
      config.basePricePerPodPeak = peakBase;
      config.extraGuestFeeOffPeak = offPeakExtra;
      config.extraGuestFeePeak = peakExtra;
      config.basePricePerPod = offPeakBase;
      config.extraGuestFee = offPeakExtra;
      config.maxGuestsPerPod = max_guests_per_pod;
      config.minGuestsPerPod = min_guests_per_pod;
      config.totalPodsAvailable = total_pods_available;
      config.twelveGuestDiscountPercent = twelve_guest_discount_percent;
      config.currency = currency;
      await config.save();
    }

    scheduleChannexAriPush("pricing-save");

    res.json(buildPricingResponse(config));
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

async function getActivePeakRateForDates(startDate, endDate) {
  if (!startDate || !endDate) return null;

  const { Op } = require("sequelize");

  const rates = await db.PeakRate.findAll({
    where: {
      isActive: true,
      startDate: { [Op.lte]: endDate },
      endDate: { [Op.gte]: startDate },
    },
  });

  if (!rates.length) return null;

  const best = rates.reduce((prev, curr) => {
    return Math.abs(Number(curr.percentageAdjustment)) >
      Math.abs(Number(prev.percentageAdjustment))
      ? curr
      : prev;
  });

  return {
    id: best.id,
    name: best.name,
    percentageAdjustment: Number(best.percentageAdjustment),
  };
}

async function getPeakRates(req, res, next) {
  try {
    const rates = await db.PeakRate.findAll({
      order: [["startDate", "ASC"]],
    });
    res.json(
      rates.map((r) => ({
        id: r.id,
        name: r.name,
        startDate: r.startDate,
        endDate: r.endDate,
        percentageAdjustment: Number(r.percentageAdjustment),
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
}

function scheduleChannexAriPush(reason) {
  const { triggerAriPush } = require("../services/channexAriService");
  triggerAriPush({ idempotencyKey: `${reason}:${Date.now()}` }).catch((err) =>
    console.error("[Channex] ARI push failed:", err.message),
  );
}

async function createPeakRate(req, res, next) {
  try {
    const { name, startDate, endDate, percentageAdjustment, isActive } = req.body;

    if (
      !name ||
      !startDate ||
      !endDate ||
      percentageAdjustment === undefined ||
      percentageAdjustment === null
    ) {
      return res.status(400).json({
        error: "name, startDate, endDate, and percentageAdjustment are required",
      });
    }

    const pct = Number(percentageAdjustment);
    if (isNaN(pct) || pct < -100 || pct > 1000) {
      return res.status(400).json({
        error: "percentageAdjustment must be a number between -100 and 1000",
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: "startDate must be before or equal to endDate" });
    }

    const rate = await db.PeakRate.create({
      name: name.trim(),
      startDate,
      endDate,
      percentageAdjustment: pct,
      isActive: isActive !== false,
    });

    scheduleChannexAriPush("peak-rate-create");

    res.status(201).json({
      id: rate.id,
      name: rate.name,
      startDate: rate.startDate,
      endDate: rate.endDate,
      percentageAdjustment: Number(rate.percentageAdjustment),
      isActive: rate.isActive,
    });
  } catch (err) {
    next(err);
  }
}

async function updatePeakRate(req, res, next) {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, percentageAdjustment, isActive } = req.body;

    const rate = await db.PeakRate.findByPk(id);
    if (!rate) return res.status(404).json({ error: "Peak rate not found" });

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: "startDate must be before or equal to endDate" });
    }

    if (percentageAdjustment !== undefined) {
      const pct = Number(percentageAdjustment);
      if (isNaN(pct) || pct < -100 || pct > 1000) {
        return res.status(400).json({
          error: "percentageAdjustment must be a number between -100 and 1000",
        });
      }
    }

    await rate.update({
      ...(name !== undefined && { name: name.trim() }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
      ...(percentageAdjustment !== undefined && {
        percentageAdjustment: Number(percentageAdjustment),
      }),
      ...(isActive !== undefined && { isActive }),
    });

    scheduleChannexAriPush("peak-rate-update");

    res.json({
      id: rate.id,
      name: rate.name,
      startDate: rate.startDate,
      endDate: rate.endDate,
      percentageAdjustment: Number(rate.percentageAdjustment),
      isActive: rate.isActive,
    });
  } catch (err) {
    next(err);
  }
}

async function deletePeakRate(req, res, next) {
  try {
    const { id } = req.params;
    const rate = await db.PeakRate.findByPk(id);
    if (!rate) return res.status(404).json({ error: "Peak rate not found" });

    await rate.destroy();
    scheduleChannexAriPush("peak-rate-delete");
    res.json({ message: "Peak rate deleted successfully" });
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
  getPeakRates,
  createPeakRate,
  updatePeakRate,
  deletePeakRate,
  getActivePeakRateForDates,
};
