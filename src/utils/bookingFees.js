const CONSUMPTION_AND_VAT_RATE = 0.125;
const SERVICE_CHARGE_RATE = 0.025;
const TOTAL_FEE_RATE = CONSUMPTION_AND_VAT_RATE + SERVICE_CHARGE_RATE;

function calculateBookingFees(amount) {
  const base = Math.max(0, Number(amount) || 0);
  const taxAmount = Math.round(base * CONSUMPTION_AND_VAT_RATE);
  const serviceChargeAmount = Math.round(base * SERVICE_CHARGE_RATE);
  const amountDue = Math.round(base + taxAmount + serviceChargeAmount);
  return { taxAmount, serviceChargeAmount, amountDue };
}

function splitInclusiveTotal(totalPrice) {
  const gross = Math.max(0, Number(totalPrice) || 0);
  const net = gross / (1 + TOTAL_FEE_RATE);
  const taxAmount = Math.round(net * CONSUMPTION_AND_VAT_RATE);
  const serviceChargeAmount = Math.round(net * SERVICE_CHARGE_RATE);
  const subTotal = Math.max(0, Math.round(gross - taxAmount - serviceChargeAmount));
  return { subTotal, taxAmount, serviceChargeAmount };
}

module.exports = {
  CONSUMPTION_AND_VAT_RATE,
  SERVICE_CHARGE_RATE,
  TOTAL_FEE_RATE,
  calculateBookingFees,
  splitInclusiveTotal,
};
