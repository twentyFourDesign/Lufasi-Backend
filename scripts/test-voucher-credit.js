const { applyVoucherToAmountDue } = require("../src/utils/voucherCredit");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// Reproduce the old bug: voucher subtracted from pre-tax, then tax applied.
function oldBuggyTotal(grossTotal, voucherValue) {
  const preTax = grossTotal / 1.125;
  return Math.max(0, preTax - voucherValue) * 1.125;
}

const oldResult = oldBuggyTotal(336500, 336000);
if (oldResult !== 0) {
  throw new Error("sanity: old bug should zero the 336,500 / 336,000 case");
}
const clientCase = applyVoucherToAmountDue(336500, 336000);
assertEqual(clientCase.applied, 336000, "applied voucher");
assertEqual(clientCase.remaining, 500, "remaining balance");

// Voucher larger than the bill should cap at amount due, not go negative.
const overpay = applyVoucherToAmountDue(336500, 400000);
assertEqual(overpay.applied, 336500, "capped voucher");
assertEqual(overpay.remaining, 0, "fully covered");

// Exact match.
const exact = applyVoucherToAmountDue(336000, 336000);
assertEqual(exact.remaining, 0, "exact cover remaining");

// No voucher.
const none = applyVoucherToAmountDue(336500, 0);
assertEqual(none.remaining, 336500, "no voucher remaining");

console.log("voucher credit tests passed");
console.log(
  "336,500 booking − 336,000 voucher = ₦" +
    clientCase.remaining.toLocaleString() +
    " due (not ₦0)",
);
