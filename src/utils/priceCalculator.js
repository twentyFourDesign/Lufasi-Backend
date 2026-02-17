/**
 * priceCalculator: computes price breakdown for booking
 *
 * inputs:
 *  - pod (model instance)
 *  - boardType 'fullBoard'|'halfBoard' -- multiplier determined by pod/base rule (we use baseAdultPrice for full by default)
 *  - guests: { adults, children, toddlers, infants }
 *  - popUpBeds: number
 *  - extras: [{ id, price, quantity }]
 *  - podPriceRules: [{ guestType, pricePercentage }]
 *
 * returns:
 *  {
 *    breakdown: [{ label, qty, unitPrice, total }],
 *    subtotal,
 *    extrasTotal,
 *    total
 *  }
 */
function priceCalculator({
  pod,
  boardType = "fullBoard",
  guests = {},
  popUpBeds = 0,
  extras = [],
  podPriceRules = [],
  pods = 1,
}) {
  const breakdown = [];
  let subtotal = 0;

  const adults = guests.adults || 0;
  const children = guests.children || 0;
  const toddlers = guests.toddlers || 0;
  const infants = guests.infants || 0;

  const guestCount = adults + children + toddlers + infants;

  const isPod = true;

  if (isPod) {
    if (boardType !== "fullBoard") {
      throw new Error(
        "Pods are now exclusively available on a Full Board basis.",
      );
    }

    const MAX_PODS = 6;
    const PRICE_PER_POD_SINGLE = 400000;
    const PRICE_EXTRA_GUEST = 100000;

    const podsNum = parseInt(pods, 10);
    const podsCount = Number.isFinite(podsNum) && podsNum > 0 ? podsNum : 1;
    const clampedPods =
      podsCount > MAX_PODS ? MAX_PODS : podsCount < 1 ? 1 : podsCount;

    const effectiveGuestCount = guestCount < 1 ? 1 : guestCount;

    const baseCost = clampedPods * PRICE_PER_POD_SINGLE;
    const extraGuests =
      effectiveGuestCount > clampedPods ? effectiveGuestCount - clampedPods : 0;
    const extraGuestCost = extraGuests * PRICE_EXTRA_GUEST;

    if (clampedPods > 0) {
      breakdown.push({
        label: "Pods (single occupancy)",
        qty: clampedPods,
        unitPrice: PRICE_PER_POD_SINGLE,
        total: baseCost,
      });
    }

    if (extraGuests > 0) {
      breakdown.push({
        label: "Extra guests sharing pods",
        qty: extraGuests,
        unitPrice: PRICE_EXTRA_GUEST,
        total: extraGuestCost,
      });
    }

    subtotal += baseCost + extraGuestCost;
  } else {
    const rulesMap = {};
    (podPriceRules || []).forEach((r) => {
      rulesMap[r.guestType] = parseFloat(r.pricePercentage);
    });

    const adultRate = parseFloat(pod.baseAdultPrice || 0);

    let boardMultiplier = 1.0;
    if (boardType === "halfBoard") boardMultiplier = 0.9;

    const adultUnit = adultRate * boardMultiplier;
    const adultTotal = adults * adultUnit;
    if (adults > 0) {
      breakdown.push({
        label: "Adult (per person)",
        qty: adults,
        unitPrice: adultUnit,
        total: adultTotal,
      });
      subtotal += adultTotal;
    }

    const childPct = rulesMap["child"] != null ? rulesMap["child"] : 75;
    const childUnit = adultUnit * (parseFloat(childPct) / 100.0);
    const childTotal = children * childUnit;
    if (children > 0) {
      breakdown.push({
        label: "Child (per person)",
        qty: children,
        unitPrice: childUnit,
        total: childTotal,
      });
      subtotal += childTotal;
    }

    const toddlerPct = rulesMap["toddler"] != null ? rulesMap["toddler"] : 50;
    const toddlerUnit = adultUnit * (parseFloat(toddlerPct) / 100.0);
    const toddlerTotal = toddlers * toddlerUnit;
    if (toddlers > 0) {
      breakdown.push({
        label: "Toddler (per person)",
        qty: toddlers,
        unitPrice: toddlerUnit,
        total: toddlerTotal,
      });
      subtotal += toddlerTotal;
    }

    if (infants > 0) {
      breakdown.push({
        label: "Infant (per person)",
        qty: infants,
        unitPrice: 0,
        total: 0,
      });
    }

    if (popUpBeds > 0) {
      const popupUnit = adultUnit;
      const popupTotal = popUpBeds * popupUnit;
      breakdown.push({
        label: "Pop-up bed (per night)",
        qty: popUpBeds,
        unitPrice: popupUnit,
        total: popupTotal,
      });
      subtotal += popupTotal;
    }
  }

  let extrasTotal = 0;
  if (extras && extras.length) {
    extras.forEach((e) => {
      const q = e.quantity || 1;
      const p = parseFloat(e.price || 0);
      const t = q * p;
      extrasTotal += t;
    });
  }

  const total = subtotal + extrasTotal;

  return { breakdown, subtotal, extrasTotal, total };
}

module.exports = { priceCalculator };
