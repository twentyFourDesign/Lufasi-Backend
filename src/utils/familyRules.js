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

function isFamilyCompositionAllowed(guests = {}, podCount = 1) {
  const g = normalizeFamilyGuests(guests);
  const pods = Number(podCount) || 1;
  const adultRateGuests = g.adults + g.teenagers;
  const childLikeGuests = g.toddlers + g.children;

  if (pods < 1 || pods > 6) return false;
  if (adultRateGuests < 1) return false;
  if (adultRateGuests > pods * 2) return false;
  if (g.infants > pods) return false;
  // At least one adult/teen per dome (no unsupervised children).
  if (adultRateGuests < pods) return false;
  // At least one billable (non-infant) guest per dome.
  if (adultRateGuests + childLikeGuests < pods) return false;
  if (adultRateGuests >= 2 && g.children >= 2 && pods < 2) return false;
  if (pods === 1 && adultRateGuests === 1 && g.children === 2 && g.toddlers === 0) {
    return g.infants <= 1;
  }

  return childLikeGuests <= pods;
}

function findMinValidPodCount(guests = {}) {
  for (let p = 1; p <= 6; p += 1) {
    if (isFamilyCompositionAllowed(guests, p)) return p;
  }
  return null;
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
  isFamilyCompositionAllowed,
  findMinValidPodCount,
  getMaxPopUpBeds,
};

