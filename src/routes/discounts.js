const express = require("express");
const router = express.Router();
const discountCtrl = require("../controllers/discountController");
const { adminAuth } = require("../middleware/auth");

// ============ DISCOUNTS ============
router.get("/", adminAuth, discountCtrl.listDiscounts);
router.post("/", adminAuth, discountCtrl.createDiscount);
router.put("/:id", adminAuth, discountCtrl.updateDiscount);
router.delete("/:id", adminAuth, discountCtrl.deleteDiscount);
router.post("/validate", discountCtrl.validateDiscount);

module.exports = router;
