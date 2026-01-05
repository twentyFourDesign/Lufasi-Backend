const express = require("express");
const router = express.Router();
const discountCtrl = require("../controllers/discountController");
const { adminAuth } = require("../middleware/auth");

// ============ DISCOUNTS ============
router.get("/discounts", adminAuth, discountCtrl.listDiscounts);
router.post("/discounts", adminAuth, discountCtrl.createDiscount);
router.put("/discounts/:id", adminAuth, discountCtrl.updateDiscount);
router.delete("/discounts/:id", adminAuth, discountCtrl.deleteDiscount);
router.post("/discounts/validate", discountCtrl.validateDiscount);

// ============ VOUCHERS ============
router.get("/vouchers", adminAuth, discountCtrl.listVouchers);
router.post("/vouchers", adminAuth, discountCtrl.createVoucher);
router.put("/vouchers/:id", adminAuth, discountCtrl.updateVoucher);
router.delete("/vouchers/:id", adminAuth, discountCtrl.deleteVoucher);
router.post("/vouchers/validate", discountCtrl.validateVoucher);

module.exports = router;
