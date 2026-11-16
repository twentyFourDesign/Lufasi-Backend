/**
 * Provider-neutral entry points for pushing availability and prices to
 * whichever channel manager is switched on (Beds24, or the older Channex).
 * Each provider skips itself when disabled, so callers never need to know.
 */
const channexAri = require("./channexAriService");
const beds24Ari = require("./beds24AriService");

/**
 * Re-push availability for a stay. checkOut is exclusive. Pass the same date
 * twice (or no checkOut) for a single night, e.g. a dome block or unblock.
 */
function syncStay(checkIn, checkOut) {
  const from = String(checkIn).slice(0, 10);
  let to = String(checkOut || checkIn).slice(0, 10);
  if (to <= from) {
    const d = new Date(`${from}T00:00:00`);
    d.setDate(d.getDate() + 1);
    to = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }

  const run = (label, fn) =>
    Promise.resolve()
      .then(fn)
      .catch((err) => console.error(`[${label}] availability push failed:`, err.message));

  return Promise.all([
    run("Channex", () => channexAri.triggerAriPushForStay(from, to)),
    run("Beds24", () => beds24Ari.triggerAriPushForStay(from, to)),
  ]);
}

/** Re-push the whole window (pricing or season changes). */
function syncAll(reason) {
  const key = `${reason}:${Date.now()}`;
  const run = (label, fn) =>
    Promise.resolve()
      .then(fn)
      .catch((err) => console.error(`[${label}] full push failed:`, err.message));

  return Promise.all([
    run("Channex", () => channexAri.triggerAriPush({ idempotencyKey: key })),
    run("Beds24", () => beds24Ari.triggerAriPush({ idempotencyKey: key })),
  ]);
}

module.exports = { syncStay, syncAll };
