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
      weekday_peak_percent:
        config.weekdayPeakPercent != null
          ? Number(config.weekdayPeakPercent)
          : 0,
      weekday_off_peak_percent:
        config.weekdayOffPeakPercent != null
          ? Number(config.weekdayOffPeakPercent)
          : 0,
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
      weekday_peak_percent,
      weekday_off_peak_percent,
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
        weekdayPeakPercent:
          weekday_peak_percent != null ? Number(weekday_peak_percent) : 0,
        weekdayOffPeakPercent:
          weekday_off_peak_percent != null
            ? Number(weekday_off_peak_percent)
            : 0,
      });
    } else {
      config.basePricePerPod = base_price_per_pod;
      config.extraGuestFee = extra_guest_fee;
      config.maxGuestsPerPod = max_guests_per_pod;
      config.minGuestsPerPod = min_guests_per_pod;
      config.totalPodsAvailable = total_pods_available;
      config.twelveGuestDiscountPercent = twelve_guest_discount_percent;
      config.currency = currency;
      if (weekday_peak_percent !== undefined) {
        config.weekdayPeakPercent = Number(weekday_peak_percent);
      }
      if (weekday_off_peak_percent !== undefined) {
        config.weekdayOffPeakPercent = Number(weekday_off_peak_percent);
      }
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
      weekday_peak_percent:
        config.weekdayPeakPercent != null
          ? Number(config.weekdayPeakPercent)
          : 0,
      weekday_off_peak_percent:
        config.weekdayOffPeakPercent != null
          ? Number(config.weekdayOffPeakPercent)
          : 0,
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

// ─── Peak / Off-Peak Rates ───────────────────────────────────────────────────

/**
 * Return the single most-impactful active peak rate that overlaps [startDate, endDate].
 * "Most impactful" = highest absolute percentageAdjustment value.
 * If none overlap, returns null.
 *
 * @param {string} startDate  YYYY-MM-DD check-in date
 * @param {string} endDate    YYYY-MM-DD check-out date
 * @returns {Promise<{id, name, percentageAdjustment}|null>}
 */
async function getActivePeakRateForDates(startDate, endDate) {
  if (!startDate || !endDate) return null;

  const { Op } = require("sequelize");

  // Fetch all active rates whose date range overlaps the booking window:
  //   rate.startDate <= checkOut  AND  rate.endDate >= checkIn
  const rates = await db.PeakRate.findAll({
    where: {
      isActive: true,
      startDate: { [Op.lte]: endDate },
      endDate:   { [Op.gte]: startDate },
    },
  });

  if (!rates.length) return null;

  // Pick the one with the highest absolute percentage adjustment
  const best = rates.reduce((prev, curr) => {
    return Math.abs(Number(curr.percentageAdjustment)) > Math.abs(Number(prev.percentageAdjustment))
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
    res.json(rates.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      percentageAdjustment: Number(r.percentageAdjustment),
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })));
  } catch (err) {
    next(err);
  }
}

async function createPeakRate(req, res, next) {
  try {
    const { name, startDate, endDate, percentageAdjustment, isActive } = req.body;

    if (!name || !startDate || !endDate || percentageAdjustment === undefined || percentageAdjustment === null) {
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
      ...(percentageAdjustment !== undefined && { percentageAdjustment: Number(percentageAdjustment) }),
      ...(isActive !== undefined && { isActive }),
    });

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
  // Peak rates
  getPeakRates,
  createPeakRate,
  updatePeakRate,
  deletePeakRate,
  getActivePeakRateForDates, // exported so bookingController can use it directly
};
