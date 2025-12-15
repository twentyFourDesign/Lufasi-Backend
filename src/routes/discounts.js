const express = require("express");
const router = express.Router();
const discountCtrl = require("../controllers/discountController");
const { adminAuth } = require("../middleware/auth");

router.post("/validate", discountCtrl.validateDiscount);
router.post("/admin/discounts", adminAuth, discountCtrl.createDiscount);
router.post("/admin/vouchers", adminAuth, discountCtrl.createVoucher);

module.exports = router;
