const { normalizeFamilyGuests } = require("./familyRules");
const { allocateGuestsToPods } = require("./podGuestPricing");

const GUEST_TYPE_ORDER = ["adult", "teen", "child", "toddler", "infant"];

function guestPoolFromCounts(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return {
    adult: g.adults,
    teen: g.teenagers,
    child: g.children,
    toddler: g.toddlers,
    infant: g.infants,
  };
}

function countTypesInPod(podGuests = []) {
  const counts = { adult: 0, teen: 0, child: 0, toddler: 0, infant: 0 };
  for (const type of podGuests) {
    if (counts[type] != null) counts[type] += 1;
  }
  return counts;
}

function countTypesAcrossPods(podAllocation = []) {
  const totals = { adult: 0, teen: 0, child: 0, toddler: 0, infant: 0 };
  for (const pod of podAllocation) {
    const podCounts = countTypesInPod(pod);
    for (const key of GUEST_TYPE_ORDER) {
      totals[key] += podCounts[key];
    }
  }
  return totals;
}

function isOneAdultTwoChildrenOnePod(guests, podCount) {
  const g = normalizeFamilyGuests(guests);
  return (
    podCount === 1 &&
    g.adults === 1 &&
    g.teenagers === 0 &&
    g.children === 2 &&
    g.toddlers === 0
  );
}

function canAddGuestToPod(podGuests, type, guests, podCount, podIndex) {
  if (!GUEST_TYPE_ORDER.includes(type)) return false;
  const allowTriple =
    isOneAdultTwoChildrenOnePod(guests, podCount) && podIndex === 0;
  const primary = podGuests.filter((g) => g === "adult" || g === "teen").length;
  const childLike = podGuests.filter(
    (g) => g === "child" || g === "toddler",
  ).length;
  const infants = podGuests.filter((g) => g === "infant").length;

  if (type === "infant") return infants < 1;
  if (type === "adult" || type === "teen") return primary < 2;
  if (type === "child" || type === "toddler") {
    return allowTriple ? childLike < 2 : childLike < 1;
  }
  return false;
}

function podAllocationFromDomeDetails(domeDetails) {
  if (!Array.isArray(domeDetails) || domeDetails.length === 0) return null;
  const allocation = domeDetails.map((d) =>
    Array.isArray(d.guestTypes) ? [...d.guestTypes] : [],
  );
  if (!allocation.some((pod) => pod.length > 0)) return null;
  return allocation;
}

function validatePodAllocation(podAllocation, guests, podCount) {
  const errors = [];
  const g = normalizeFamilyGuests(guests);
  const expected = guestPoolFromCounts(g);
  const assigned = countTypesAcrossPods(podAllocation);

  for (const key of GUEST_TYPE_ORDER) {
    if (assigned[key] !== expected[key]) {
      errors.push(
        `Assign all ${key} guests (${expected[key]} needed, ${assigned[key]} placed).`,
      );
    }
  }

  const pods = Number(podCount) || 1;
  for (let i = 0; i < podAllocation.length; i++) {
    const pod = podAllocation[i] || [];
    const allowTriple = isOneAdultTwoChildrenOnePod(g, pods) && i === 0;
    const primary = pod.filter((t) => t === "adult" || t === "teen").length;
    const childLike = pod.filter((t) => t === "child" || t === "toddler").length;
    const infants = pod.filter((t) => t === "infant").length;
    if (primary > 2) {
      errors.push(`Dome ${i + 1} can have at most 2 adults/teens.`);
    }
    if (childLike > (allowTriple ? 2 : 1)) {
      errors.push(
        allowTriple
          ? `Dome ${i + 1} can have at most 2 children in this mix.`
          : `Dome ${i + 1} can have at most 1 child or toddler.`,
      );
    }
    if (infants > 1) {
      errors.push(`Dome ${i + 1} can only have one infant.`);
    }
  }

  if (
    g.infants + g.toddlers + g.children > 0 &&
    g.adults < 1 &&
    g.teenagers < 1
  ) {
    errors.push("At least one adult or teen must be in the booking.");
  }

  return { valid: errors.length === 0, errors };
}

function resolvePodAllocation({ domeDetails, guestCounts, podsCount }) {
  const fromDomes = podAllocationFromDomeDetails(domeDetails);
  if (fromDomes) {
    const validation = validatePodAllocation(
      fromDomes,
      guestCounts,
      podsCount,
    );
    if (!validation.valid) {
      return { allocation: null, error: validation.errors[0] };
    }
    return { allocation: fromDomes, error: null };
  }

  const g = normalizeFamilyGuests(guestCounts);
  return {
    allocation: allocateGuestsToPods(g, podsCount),
    error: null,
  };
}

module.exports = {
  GUEST_TYPE_ORDER,
  guestPoolFromCounts,
  countTypesInPod,
  countTypesAcrossPods,
  canAddGuestToPod,
  podAllocationFromDomeDetails,
  validatePodAllocation,
  resolvePodAllocation,
};
