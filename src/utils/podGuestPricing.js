/**
 * Per-dome guest allocation and pricing.
 *
 * Rules:
 * - Each occupied dome pays basePerPod per night (covers 1st guest at adult rate).
 * - 2nd guest in a dome pays extraGuestFee × age multiplier.
 * - Teen alone in a dome: pays adult rate via base only (no teen discount).
 * - Dome without an adult: 1st guest still covered by base (adult rate); 2nd gets age discount.
 * - Infants: free (do not count toward the 2 billable slots).
 */

const TEEN_RATE_MULTIPLIER = 0.75;
const CHILD_RATE_MULTIPLIER = 0.5;
const TODDLER_RATE_MULTIPLIER = 0.25;

const BILLABLE_PRIORITY = {
  adult: 0,
  teen: 1,
  child: 2,
  toddler: 3,
};

function getAgeMultiplier(guestType) {
  if (guestType === "teen") return TEEN_RATE_MULTIPLIER;
  if (guestType === "child") return CHILD_RATE_MULTIPLIER;
  if (guestType === "toddler") return TODDLER_RATE_MULTIPLIER;
  return 1;
}

function isOneAdultTwoChildrenOnePod(guests, podCount) {
  return (
    podCount === 1 &&
    guests.adults === 1 &&
    guests.teenagers === 0 &&
    guests.children === 2 &&
    guests.toddlers === 0
  );
}

/**
 * Distribute guests across domes (max 2 billable + infants per dome).
 * Exception: 1 adult + 2 children may share a single dome (3 billable).
 * @returns {string[][]} pods[p] = guest type tokens
 */
function allocateGuestsToPods(guests, podCount) {
  const pods = Array.from({ length: podCount }, () => []);
  let adults = guests.adults;
  let teens = guests.teenagers;
  let children = guests.children;
  let toddlers = guests.toddlers;
  let infants = guests.infants;
  const allowTripleOccupancy = isOneAdultTwoChildrenOnePod(guests, podCount);

  const pushToPod = (p, type) => {
    if (p < 0 || p >= podCount) return false;
    const billable = pods[p].filter((g) => g !== "infant").length;
    const maxBillable = allowTripleOccupancy && p === 0 ? 3 : 2;
    if (type === "infant") {
      if (pods[p].filter((g) => g === "infant").length >= 1) return false;
      pods[p].push("infant");
      return true;
    }
    if (billable >= maxBillable) return false;
    pods[p].push(type);
    return true;
  };

  // Adults spread one per dome first.
  for (let p = 0; p < podCount && adults > 0; p++) {
    pushToPod(p, "adult");
    adults--;
  }

  // Remaining adults as second guests.
  while (adults > 0) {
    let placed = false;
    for (let p = 0; p < podCount && adults > 0; p++) {
      if (pushToPod(p, "adult")) {
        adults--;
        placed = true;
      }
    }
    if (!placed) break;
  }

  // Teens: prefer empty domes (alone teen = adult rate via base).
  while (teens > 0) {
    let placed = false;
    for (let p = 0; p < podCount && teens > 0; p++) {
      if (pods[p].filter((g) => g !== "infant").length === 0) {
        pushToPod(p, "teen");
        teens--;
        placed = true;
      }
    }
    if (!placed) {
      for (let p = 0; p < podCount && teens > 0; p++) {
        if (pushToPod(p, "teen")) {
          teens--;
          placed = true;
        }
      }
    }
    if (!placed) break;
  }

  // Children — empty domes first (1st guest = adult base).
  while (children > 0) {
    let placed = false;
    for (let p = 0; p < podCount && children > 0; p++) {
      if (pods[p].filter((g) => g !== "infant").length === 0) {
        pushToPod(p, "child");
        children--;
        placed = true;
      }
    }
    if (!placed) {
      for (let p = 0; p < podCount && children > 0; p++) {
        if (pushToPod(p, "child")) {
          children--;
          placed = true;
        }
      }
    }
    if (!placed) break;
  }

  // Toddlers — same pattern.
  while (toddlers > 0) {
    let placed = false;
    for (let p = 0; p < podCount && toddlers > 0; p++) {
      if (pods[p].filter((g) => g !== "infant").length === 0) {
        pushToPod(p, "toddler");
        toddlers--;
        placed = true;
      }
    }
    if (!placed) {
      for (let p = 0; p < podCount && toddlers > 0; p++) {
        if (pushToPod(p, "toddler")) {
          toddlers--;
          placed = true;
        }
      }
    }
    if (!placed) break;
  }

  // Infants last.
  while (infants > 0) {
    let placed = false;
    for (let p = 0; p < podCount && infants > 0; p++) {
      if (pushToPod(p, "infant")) {
        infants--;
        placed = true;
      }
    }
    if (!placed) break;
  }

  return pods;
}

/**
 * Charge for one dome on one night.
 */
function calculatePodNightCharge(podGuests, basePerPod, extraGuestFee) {
  const billable = podGuests.filter((g) => g !== "infant");
  if (billable.length === 0) {
    return {
      total: 0,
      base: 0,
      extraAdult: 0,
      teenExtra: 0,
      childExtra: 0,
      toddlerExtra: 0,
      aloneTeen: false,
    };
  }

  let charge = basePerPod;
  let extraAdult = 0;
  let teenExtra = 0;
  let childExtra = 0;
  let toddlerExtra = 0;

  if (billable.length === 1) {
    const only = billable[0];
    // Teen/child/toddler alone: adult rate via base only (rule 2 & 1).
    return {
      total: charge,
      base: basePerPod,
      extraAdult: 0,
      teenExtra: 0,
      childExtra: 0,
      toddlerExtra: 0,
      aloneTeen: only === "teen",
    };
  }

  const sorted = [...billable].sort(
    (a, b) => (BILLABLE_PRIORITY[a] ?? 9) - (BILLABLE_PRIORITY[b] ?? 9),
  );

  for (let i = 1; i < sorted.length; i++) {
    const guestType = sorted[i];
    const mult = getAgeMultiplier(guestType);
    const extra = extraGuestFee * mult;
    charge += extra;

    if (guestType === "teen") teenExtra += extra;
    else if (guestType === "child") childExtra += extra;
    else if (guestType === "toddler") toddlerExtra += extra;
    else extraAdult += extra;
  }

  return {
    total: charge,
    base: basePerPod,
    extraAdult,
    teenExtra,
    childExtra,
    toddlerExtra,
    aloneTeen: false,
  };
}

module.exports = {
  TEEN_RATE_MULTIPLIER,
  CHILD_RATE_MULTIPLIER,
  TODDLER_RATE_MULTIPLIER,
  allocateGuestsToPods,
  calculatePodNightCharge,
};
