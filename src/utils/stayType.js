const DAY_VISIT = "dayVisit";
const DAY_VISIT_RATE = 0.5;

function isDayVisit(stayType) {
  return stayType === DAY_VISIT;
}

function applyStayRate(amount, stayType) {
  const value = Number(amount) || 0;
  return isDayVisit(stayType) ? value * DAY_VISIT_RATE : value;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextCalendarDay(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return toYmd(date);
}

/** Visit date must be today or tomorrow. Later dates are not bookable. */
function isDayVisitBookable(ymd, now = new Date()) {
  const visit = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visit)) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return visit === toYmd(today) || visit === toYmd(tomorrow);
}

module.exports = {
  DAY_VISIT,
  DAY_VISIT_RATE,
  isDayVisit,
  applyStayRate,
  nextCalendarDay,
  isDayVisitBookable,
};
