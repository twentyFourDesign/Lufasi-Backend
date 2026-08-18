/**
 * Gift vouchers are a credit against the tax-inclusive amount due.
 * They must not be subtracted from the pre-tax subtotal (that writes off
 * any remainder plus tax, e.g. ₦336,500 − ₦336,000 → ₦0 instead of ₦500).
 */
function applyVoucherToAmountDue(amountDue, voucherValue) {
  const due = Math.max(0, Math.round(Number(amountDue) || 0));
  const voucher = Math.max(0, Number(voucherValue) || 0);
  const applied = Math.min(voucher, due);
  const remaining = Math.max(0, due - applied);
  return { applied, remaining };
}

module.exports = { applyVoucherToAmountDue };
