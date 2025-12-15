const db = require("../models");
const { v4: uuidv4 } = require("uuid");
async function createDiscount(req, res, next) {
  try {
    const body = req.body;
    const d = await db.Discount.create({
      id: uuidv4(),
      code: body.code.toUpperCase(),
      type: body.type,
      value: body.value,
      startDate: body.startDate,
      endDate: body.endDate,
      minimumNights: body.minimumNights || 1,
      maxUses: body.maxUses || 0,
    });
    res.json({ discount: d });
  } catch (err) {
    next(err);
  }
}

async function createVoucher(req, res, next) {
  try {
    const body = req.body;
    const v = await db.Voucher.create({
      id: uuidv4(),
      code: body.code.toUpperCase(),
      value: body.value,
      validFrom: body.validFrom,
      validTo: body.validTo,
      maxUses: body.maxUses || 0,
    });
    res.json({ voucher: v });
  } catch (err) {
    next(err);
  }
}

// validate discount by code (public)
async function validateDiscount(req, res, next) {
  try {
    const { code } = req.body;
    const d = await db.Discount.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!d) return res.status(404).json({ valid: false, reason: "Not found" });
    // TODO: check dates, uses, etc.
    res.json({ valid: true, discount: d });
  } catch (err) {
    next(err);
  }
}

module.exports = { createDiscount, createVoucher, validateDiscount };
