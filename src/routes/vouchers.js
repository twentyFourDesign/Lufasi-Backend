const express = require("express");
const router = express.Router();
const discountCtrl = require("../controllers/discountController");
const { adminAuth } = require("../middleware/auth");

// ============ VOUCHERS ============
router.get("/", adminAuth, discountCtrl.listVouchers);
router.post("/", adminAuth, discountCtrl.createVoucher);
router.put("/:id", adminAuth, discountCtrl.updateVoucher);
router.delete("/:id", adminAuth, discountCtrl.deleteVoucher);
router.post("/validate", discountCtrl.validateVoucher);

module.exports = router;
