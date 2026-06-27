const db = require("../models");

/**
 * Load all blocked dates grouped for quick lookup.
 * @returns {Promise<{ byExtraId: Map<string, Set<string>>, byCategory: Map<string, Set<string>> }>}
 */
async function loadBlockedDateIndex() {
  const rows = await db.ExtraBlockedDate.findAll({
    attributes: ["extraId", "category", "date"],
  });

  const byExtraId = new Map();
  const byCategory = new Map();

  for (const row of rows) {
    const dateStr = String(row.date).slice(0, 10);
    if (row.extraId) {
      if (!byExtraId.has(row.extraId)) byExtraId.set(row.extraId, new Set());
      byExtraId.get(row.extraId).add(dateStr);
    }
    if (row.category) {
      const cat = String(row.category).toLowerCase();
      if (!byCategory.has(cat)) byCategory.set(cat, new Set());
      byCategory.get(cat).add(dateStr);
    }
  }

  return { byExtraId, byCategory };
}

function isDateBlockedForExtra({ extraId, category, dateStr, index }) {
  const normalized = String(dateStr).slice(0, 10);
  if (extraId && index.byExtraId.get(extraId)?.has(normalized)) return true;
  if (category && index.byCategory.get(String(category).toLowerCase())?.has(normalized)) {
    return true;
  }
  return false;
}

/**
 * Validate selected extra personalization dates against admin blocks.
 * @returns {Promise<string|null>} error message or null if ok
 */
async function validateBlockedExtraDates({ extras, extraPersonalizations }) {
  if (!Array.isArray(extras) || !extras.length) return null;
  if (!Array.isArray(extraPersonalizations) || !extraPersonalizations.length) return null;

  const index = await loadBlockedDateIndex();
  const extraIds = extras.map((e) => e.id);

  const extraModels = await db.Extra.findAll({
    where: { id: extraIds },
    attributes: ["id", "name", "category"],
  });
  const extraById = new Map(extraModels.map((e) => [e.id, e]));

  for (const personalization of extraPersonalizations) {
    const extra = extraById.get(personalization.extraId);
    if (!extra) continue;
    const dates = Array.isArray(personalization.dates) ? personalization.dates : [];
    for (const dateStr of dates) {
      if (
        isDateBlockedForExtra({
          extraId: extra.id,
          category: extra.category,
          dateStr,
          index,
        })
      ) {
        const formatted = dateStr;
        return `${extra.name} is not available on ${formatted}. Please choose another date or remove this extra.`;
      }
    }
  }

  return null;
}

module.exports = {
  loadBlockedDateIndex,
  isDateBlockedForExtra,
  validateBlockedExtraDates,
};
