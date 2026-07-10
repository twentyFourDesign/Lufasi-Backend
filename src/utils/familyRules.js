/**
 * Pod occupancy rules (not an exclusive guest-mix whitelist).
 *
 * - At least one adult or teen
 * - Max 2 billable guests per dome (adults, teens, children, toddlers)
 * - Exception: 1 adult + 2 children may share a single dome
 * - Max 1 infant per dome (infants are not billable)
 * - Max 1 child/toddler per dome (except the 1A+2C triple case)
 * - Billable guests must be >= dome count (no empty billable domes)
 */

function normalizeFamilyGuests(guests = {}) {
  return {
    adults: Number(guests.adults) || 0,
    teenagers: Number(guests.teenagers) || 0,
    toddlers: Number(guests.toddlers) || 0,
    children: Number(guests.children) || 0,
    infants: Number(guests.infants) || 0,
  };
}

function hasUnder13Guests(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return g.infants + g.toddlers + g.children > 0;
}

function getBillableGuestCount(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return g.adults + g.teenagers + g.toddlers + g.children;
}

function getDisplayGuestCount(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return g.adults + g.teenagers + g.toddlers + g.children + g.infants;
}

function isOneAdultTwoChildrenOnePod(g, pods) {
  return (
    pods === 1 &&
    g.adults === 1 &&
    g.teenagers === 0 &&
    g.children === 2 &&
    g.toddlers === 0
  );
}

function isFamilyCompositionAllowed(guests = {}, podCount = 1) {
  const g = normalizeFamilyGuests(guests);
  const pods = Number(podCount) || 1;
  const billable = getBillableGuestCount(guests);
  const childLikeGuests = g.toddlers + g.children;
  const triple = isOneAdultTwoChildrenOnePod(g, pods);

  if (pods < 1 || pods > 6) return false;
  if (g.adults + g.teenagers < 1) return false;
  if (g.infants > pods) return false;
  if (billable < pods) return false;

  if (triple) {
    return g.infants <= 1;
  }

  if (billable > pods * 2) return false;
  if (childLikeGuests > pods) return false;

  return true;
}

function findMinValidPodCount(guests = {}) {
  for (let p = 1; p <= 6; p += 1) {
    if (isFamilyCompositionAllowed(guests, p)) return p;
  }
  return null;
}

function findMaxValidPodCount(guests = {}, availablePods = 6) {
  const cap = Math.min(6, Math.max(1, Number(availablePods) || 6));
  let best = null;
  for (let p = 1; p <= cap; p += 1) {
    if (isFamilyCompositionAllowed(guests, p)) best = p;
  }
  return best;
}

/** Occupancy fit check — not a fixed whitelist of mixes. */
function isAllowedGuestCombination(guests = {}) {
  return findMinValidPodCount(guests) !== null;
}

function getMaxPopUpBeds(guests = {}, podCount = 1) {
  const g = normalizeFamilyGuests(guests);
  const pods = Math.max(1, Number(podCount) || 1);
  return Math.min(pods, g.toddlers + g.children);
}

module.exports = {
  normalizeFamilyGuests,
  hasUnder13Guests,
  getBillableGuestCount,
  getDisplayGuestCount,
  isAllowedGuestCombination,
  isFamilyCompositionAllowed,
  findMinValidPodCount,
  findMaxValidPodCount,
  getMaxPopUpBeds,
};
