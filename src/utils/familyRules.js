/**
 * Client dome occupancy rules:
 *
 * - Max 3 guests per dome from: adults, teens, children, toddlers
 * - Plus 1 infant only when an adult is present
 * - 2 adults + 2 children → 2 domes; 1 adult + 2 children → 1 dome
 */

const MAX_GUESTS_PER_DOME = 3;

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

function getOccupancyGuestCount(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return g.adults + g.teenagers + g.toddlers + g.children;
}

function getBillableGuestCount(guests = {}) {
  return getOccupancyGuestCount(guests);
}

function getPrimaryGuestCount(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return g.adults + g.teenagers;
}

function getDisplayGuestCount(guests = {}) {
  const g = normalizeFamilyGuests(guests);
  return g.adults + g.teenagers + g.toddlers + g.children + g.infants;
}

function isFamilyCompositionAllowed(guests = {}, podCount = 1) {
  const g = normalizeFamilyGuests(guests);
  const pods = Number(podCount) || 1;
  const occupancy = getOccupancyGuestCount(g);
  const primary = getPrimaryGuestCount(g);

  if (pods < 1 || pods > 6) return false;
  if (primary < 1) return false;
  if (primary < pods) return false;
  if (occupancy > pods * MAX_GUESTS_PER_DOME) return false;
  if (g.infants > pods) return false;
  if (g.infants > 0 && g.adults < 1) return false;

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
  MAX_GUESTS_PER_DOME,
  normalizeFamilyGuests,
  hasUnder13Guests,
  getOccupancyGuestCount,
  getBillableGuestCount,
  getPrimaryGuestCount,
  getDisplayGuestCount,
  isAllowedGuestCombination,
  isFamilyCompositionAllowed,
  findMinValidPodCount,
  findMaxValidPodCount,
  getMaxPopUpBeds,
};
