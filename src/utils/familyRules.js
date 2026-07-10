/**
 * Original family / dome occupancy rules:
 *
 * Per dome maximum:
 * - 2 adults/teens (primary guests)
 * - + 1 child (4–12) or toddler (1–3) sharing / optional pop-up bed
 * - + 1 infant (0–1, free)
 *
 * Exception: 1 adult + 2 children may share a single dome.
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

function getPrimaryGuestCount(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return g.adults + g.teenagers;
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
  const primary = getPrimaryGuestCount(g);
  const childLikeGuests = g.toddlers + g.children;
  const triple = isOneAdultTwoChildrenOnePod(g, pods);

  if (pods < 1 || pods > 6) return false;
  if (primary < 1) return false;
  if (primary < pods) return false;
  if (primary > pods * 2) return false;
  if (g.infants > pods) return false;

  if (triple) {
    return g.infants <= 1;
  }

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
  getPrimaryGuestCount,
  getDisplayGuestCount,
  isAllowedGuestCombination,
  isFamilyCompositionAllowed,
  findMinValidPodCount,
  findMaxValidPodCount,
  getMaxPopUpBeds,
};
