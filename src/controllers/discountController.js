const db = require("../models");
const { v4: uuidv4 } = require("uuid");

// ============ DISCOUNTS ============

async function listDiscounts(req, res, next) {
  try {
    const discounts = await db.Discount.findAll({
      order: [["createdAt", "DESC"]],
    });
    res.json({ discounts });
  } catch (err) {
    next(err);
  }
}

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

async function updateDiscount(req, res, next) {
  try {
    const discount = await db.Discount.findByPk(req.params.id);
    if (!discount) return res.status(404).json({ error: "Discount not found" });

    const updates = { ...req.body };
    if (updates.code) updates.code = updates.code.toUpperCase();

    await discount.update(updates);
    res.json({ discount });
  } catch (err) {
    next(err);
  }
}

async function deleteDiscount(req, res, next) {
  try {
    const discount = await db.Discount.findByPk(req.params.id);
    if (!discount) return res.status(404).json({ error: "Discount not found" });
    await discount.destroy();
    res.json({ message: "Discount deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function validateDiscount(req, res, next) {
  try {
    const { code } = req.body;
    const d = await db.Discount.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!d) return res.status(404).json({ valid: false, reason: "Not found" });

    const today = new Date().toISOString().split("T")[0];
    if (d.startDate && today < d.startDate) {
      return res.json({ valid: false, reason: "Discount not yet active" });
    }
    if (d.endDate && today > d.endDate) {
      return res.json({ valid: false, reason: "Discount expired" });
    }
    if (d.maxUses > 0 && d.usedCount >= d.maxUses) {
      return res.json({ valid: false, reason: "Discount usage limit reached" });
    }

    res.json({ valid: true, discount: d });
  } catch (err) {
    next(err);
  }
}

// ============ VOUCHERS ============

async function listVouchers(req, res, next) {
  try {
    const vouchers = await db.Voucher.findAll({
      order: [["createdAt", "DESC"]],
    });
    res.json({ vouchers });
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

async function updateVoucher(req, res, next) {
  try {
    const voucher = await db.Voucher.findByPk(req.params.id);
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });

    const updates = { ...req.body };
    if (updates.code) updates.code = updates.code.toUpperCase();

    await voucher.update(updates);
    res.json({ voucher });
  } catch (err) {
    next(err);
  }
}

async function deleteVoucher(req, res, next) {
  try {
    const voucher = await db.Voucher.findByPk(req.params.id);
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });
    await voucher.destroy();
    res.json({ message: "Voucher deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function validateVoucher(req, res, next) {
  try {
    const { code } = req.body;
    const v = await db.Voucher.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!v) return res.status(404).json({ valid: false, reason: "Not found" });

    const today = new Date().toISOString().split("T")[0];
    if (v.validFrom && today < v.validFrom) {
      return res.json({ valid: false, reason: "Voucher not yet active" });
    }
    if (v.validTo && today > v.validTo) {
      return res.json({ valid: false, reason: "Voucher expired" });
    }
    if (v.maxUses > 0 && v.usedCount >= v.maxUses) {
      return res.json({ valid: false, reason: "Voucher usage limit reached" });
    }

    res.json({ valid: true, voucher: v });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Discounts
  listDiscounts,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  validateDiscount,
  // Vouchers
  listVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  validateVoucher,
};
