/**
 * Client-approved guest mixes (adults, teens, children, toddlers, infants).
 * Only these exact combinations may book.
 */

function guestCombinationKey(guests) {
  return [
    Number(guests.adults) || 0,
    Number(guests.teenagers) || 0,
    Number(guests.children) || 0,
    Number(guests.toddlers) || 0,
    Number(guests.infants) || 0,
  ].join(",");
}

const ALLOWED_GUEST_COMBINATION_KEYS = new Set([
  "2,1,0,0,1",
  "2,0,1,0,1",
  "2,0,0,1,1",
  "1,2,0,0,1",
  "1,0,2,0,1",
  "1,0,0,2,1",
  "1,1,1,0,1",
  "1,1,0,1,1",
  "1,0,1,1,1",
  "2,1,0,0,0",
  "2,0,1,0,0",
  "2,0,0,1,0",
  "1,2,0,0,0",
  "1,0,2,0,0",
  "1,0,0,2,0",
  "1,1,1,0,0",
  "1,1,0,1,0",
  "1,0,1,1,0",
  "2,0,0,0,1",
  "1,1,0,0,1",
  "1,0,1,0,1",
  "1,0,0,1,1",
  "0,2,0,0,0",
  "2,0,0,0,0",
  "1,1,0,0,0",
  "1,0,1,0,0",
  "1,0,0,1,0",
  "0,2,1,0,0",
  "0,2,0,1,0",
  "0,1,2,0,0",
  "0,1,0,2,0",
  "0,1,1,1,0",
  "0,1,1,0,0",
  "0,1,0,1,0",
  "1,0,0,0,1",
  "0,1,0,0,1",
  "1,0,0,0,0",
  "0,1,0,0,0",
]);

function isAllowedGuestCombination(guests = {}) {
  return ALLOWED_GUEST_COMBINATION_KEYS.has(guestCombinationKey(guests));
}

module.exports = {
  isAllowedGuestCombination,
};
