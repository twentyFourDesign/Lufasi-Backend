/** Alcohol is included in published stay rates. Opting out credits this amount. */
const ALCOHOL_PACKAGE_PER_ADULT_PER_NIGHT = 45000;

function isAlcoholPackageIncluded(value) {
  return value !== false;
}

function getAlcoholPackageAdultCount(guests = {}) {
  return Math.max(0, Number(guests.adults) || 0);
}

function calculateAlcoholPackageAmount({ guests, nights } = {}) {
  const adults = getAlcoholPackageAdultCount(guests);
  const n = Math.max(0, Number(nights) || 0);
  return adults * n * ALCOHOL_PACKAGE_PER_ADULT_PER_NIGHT;
}

function calculateAlcoholOptOutCredit({
  alcoholPackageIncluded,
  guests,
  nights,
} = {}) {
  if (isAlcoholPackageIncluded(alcoholPackageIncluded)) return 0;
  return calculateAlcoholPackageAmount({ guests, nights });
}

module.exports = {
  ALCOHOL_PACKAGE_PER_ADULT_PER_NIGHT,
  isAlcoholPackageIncluded,
  getAlcoholPackageAdultCount,
  calculateAlcoholPackageAmount,
  calculateAlcoholOptOutCredit,
};
