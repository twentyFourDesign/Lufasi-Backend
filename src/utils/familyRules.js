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
  const billable = getBillableGuestCount(guests);
  const childLikeGuests = g.toddlers + g.children;
  const needsAdultSupervisor =
    g.infants + g.toddlers + g.children > 0;
  const oneAdultTwoChildrenOnePod =
    pods === 1 &&
    g.adults === 1 &&
    g.teenagers === 0 &&
    g.children === 2 &&
    g.toddlers === 0;

  if (pods < 1 || pods > 6) return false;
  // At least one adult or teen must be in the booking.
  if (g.adults + g.teenagers < 1) return false;
  // Infants/toddlers/children require an adult somewhere in the booking.
  if (needsAdultSupervisor && g.adults < 1) return false;
  if (billable > pods * 2 && !oneAdultTwoChildrenOnePod) return false;
  if (billable < pods) return false;
  if (g.infants > pods) return false;

  if (g.adults + g.teenagers >= 2 && g.children >= 2 && pods < 2) {
    return false;
  }
  if (oneAdultTwoChildrenOnePod) {
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
