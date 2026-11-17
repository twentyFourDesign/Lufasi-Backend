/**
 * Offline self-test for the Beds24 integration. No database, no network:
 * the models are replaced by a tiny in-memory fake and the Beds24 HTTP layer
 * is stubbed. Run:  TZ=UTC node scripts/beds24-selftest.js
 *
 * It checks Lufasi's own logic. It cannot confirm Beds24's real request and
 * response formats; that is what scripts/beds24-qa-checklist.md is for.
 */
process.env.TZ = "UTC";
process.env.BEDS24_ENABLED = "true";
process.env.BEDS24_REFRESH_TOKEN = "refresh-test";
process.env.BEDS24_PROPERTY_ID = "111";
process.env.BEDS24_ROOM_ID = "222";
process.env.BEDS24_WEBHOOK_SECRET = "s3cret";
process.env.BEDS24_INITIAL_PULL_DAYS = "30";

const assert = require("assert");
const path = require("path");
const Module = require("module");
const { Op } = require("sequelize");

const src = (p) => path.join(__dirname, "..", "src", p);

// ---------- in-memory fake models ----------
let idSeq = 0;
const ymdOf = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

function matches(row, where = {}) {
  for (const key of Reflect.ownKeys(where)) {
    const cond = where[key];
    if (key === Op.or) {
      if (!cond.some((c) => matches(row, c))) return false;
      continue;
    }
    const val = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      for (const op of Reflect.ownKeys(cond)) {
        const arg = cond[op];
        if (op === Op.in) {
          if (!arg.map(ymdOrRaw).includes(ymdOrRaw(val))) return false;
        } else if (op === Op.lt) {
          if (!(ymdOf(val) < ymdOf(arg))) return false;
        } else if (op === Op.gt) {
          if (!(ymdOf(val) > ymdOf(arg))) return false;
        } else if (op === Op.gte) {
          if (arg instanceof Date ? !(new Date(val) >= arg) : !(ymdOf(val) >= ymdOf(arg))) return false;
        } else if (op === Op.between) {
          if (!(ymdOf(val) >= ymdOf(arg[0]) && ymdOf(val) <= ymdOf(arg[1]))) return false;
        } else {
          throw new Error(`fake db: unsupported operator ${String(op)}`);
        }
      }
    } else if (cond !== val) {
      return false;
    }
  }
  return true;
}
const ymdOrRaw = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : v);

function makeModel() {
  const rows = [];
  const wrap = (r) => {
    r.update = async (patch) => Object.assign(r, patch);
    return r;
  };
  return {
    rows,
    async create(obj) {
      const r = wrap({ id: obj.id || `id-${++idSeq}`, ...obj });
      rows.push(r);
      return r;
    },
    async findAll({ where } = {}) {
      return rows.filter((r) => matches(r, where));
    },
    async findOne({ where } = {}) {
      return rows.find((r) => matches(r, where)) || null;
    },
    async findOrCreate({ where, defaults }) {
      const found = rows.find((r) => matches(r, where));
      if (found) return [found, false];
      return [await this.create({ ...defaults, ...where }), true];
    },
    async findByPk(id) {
      return rows.find((r) => r.id === id) || null;
    },
    async destroy({ where } = {}) {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
    },
  };
}

const db = {
  Op,
  Sequelize: { Op },
  Booking: makeModel(),
  BookingGuest: makeModel(),
  GuestDirectory: makeModel(),
  BookingLog: makeModel(),
  CalendarAvailability: makeModel(),
  Beds24BookingMap: makeModel(),
  ChannexSyncLog: makeModel(),
  ChannexBookingMap: makeModel(),
  Pod: makeModel(),
  PeakRate: makeModel(),
  PricingConfiguration: {
    async findByPk() {
      return {
        totalPodsAvailable: 6,
        basePricePerPodOffPeak: 300000,
        basePricePerPodPeak: 400000,
        extraGuestFeeOffPeak: 100000,
        extraGuestFeePeak: 150000,
      };
    },
  },
  sequelize: {
    async transaction() {
      return { async commit() {}, async rollback() {} };
    },
    async query() {
      return [[]];
    },
  },
};

const mails = [];
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "../models") return db;
  if (request === "./emailService")
    return { sendEmail: async (m) => mails.push(m.subject) };
  if (request === "../config/emailConfig")
    return { isConfigured: () => true, adminEmail: "admin@test" };
  return origLoad.call(this, request, parent, ...rest);
};

const beds24Config = require(src("config/beds24Config"));
const beds24Service = require(src("services/beds24Service"));
const ari = require(src("services/beds24AriService"));
const importer = require(src("services/beds24BookingImportService"));
const controller = require(src("controllers/beds24Controller"));
const { retryInBackground } = require(src("utils/pushRetry"));

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.stack}`);
    process.exitCode = 1;
  }
}
const wait = setTimeout; // real timer, unaffected by tests that patch setTimeout
const tick = (ms = 20) => new Promise((r) => wait(r, ms));

function resetDb() {
  for (const k of ["Booking", "BookingGuest", "GuestDirectory", "BookingLog", "CalendarAvailability", "Beds24BookingMap", "ChannexSyncLog"]) {
    db[k].rows.length = 0;
  }
  mails.length = 0;
}

const future = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function addWebBooking(checkIn, checkOut, pods = 1) {
  return db.Booking.create({
    bookingStatus: "confirmed",
    checkIn,
    checkOut,
    podsCount: pods,
    podCount: pods,
  });
}

function beds24Raw(over = {}) {
  return {
    id: 9001,
    status: "confirmed",
    arrival: future(10),
    departure: future(12),
    numAdult: 2,
    numChild: 1,
    firstName: "Ada",
    lastName: "Obi",
    email: "ada@example.com",
    phone: "0800",
    price: 900000,
    channel: "booking",
    apiReference: "BK-123",
    modifiedTime: "2026-11-16T10:00:00Z",
    ...over,
  };
}

(async () => {
  await db.Pod.create({ podName: "Dome 1", isDeleted: false, isActive: true });

  console.log("Beds24 client");

  await test("fetches a token once and reuses it", async () => {
    let tokenCalls = 0;
    const seen = [];
    beds24Service.client.get = async (url, opts) => {
      tokenCalls++;
      assert.equal(url, "/authentication/token");
      assert.equal(opts.headers.refreshToken, "refresh-test");
      return { data: { token: `tok${tokenCalls}`, expiresIn: 3600 } };
    };
    beds24Service.client.request = async (cfg) => {
      seen.push(cfg.headers.token);
      return { data: { ok: true } };
    };
    beds24Service.accessToken = null;
    await beds24Service.request("GET", "/x");
    await beds24Service.request("GET", "/x");
    assert.equal(tokenCalls, 1);
    assert.deepEqual(seen, ["tok1", "tok1"]);
  });

  await test("booking list also asks for cancelled bookings (live account ignores includeCancelled)", async () => {
    const calls = [];
    const orig = beds24Service.request;
    beds24Service.request = async (method, path, opts) => {
      calls.push(opts.params);
      if (opts.params.status === "cancelled") return { data: [{ id: 7, status: "cancelled" }] };
      return { data: [{ id: 5, status: "confirmed" }, { id: 7, status: "confirmed" }] };
    };
    try {
      const rows = await beds24Service.getBookingsModifiedSince("2026-11-17T00:00:00Z");
      assert.equal(calls.length, 2);
      assert.equal(calls[0].status, undefined);
      assert.equal(calls[1].status, "cancelled");
      assert.ok(calls.every((c) => !("includeCancelled" in c)));
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
      assert.deepEqual(byId, { 5: "confirmed", 7: "cancelled" }); // the cancelled row wins
    } finally {
      beds24Service.request = orig;
    }
  });

  await test("refreshes the token and retries once on 401", async () => {
    let n = 0;
    let tokens = 0;
    beds24Service.client.get = async () => ({ data: { token: `t${++tokens}`, expiresIn: 3600 } });
    beds24Service.client.request = async (cfg) => {
      n++;
      if (cfg.headers.token === "t1") {
        const e = new Error("unauthorized");
        e.response = { status: 401, data: { error: "bad token" } };
        throw e;
      }
      return { data: { ok: cfg.headers.token } };
    };
    beds24Service.accessToken = null;
    const res = await beds24Service.request("GET", "/x");
    assert.equal(res.ok, "t2");
    assert.equal(n, 2);
  });

  await test("waits out a 429 using the reset header, then succeeds", async () => {
    let calls = 0;
    const realSetTimeout = global.setTimeout;
    const waits = [];
    global.setTimeout = (fn, ms) => {
      waits.push(ms);
      return realSetTimeout(fn, 1);
    };
    beds24Service.client.get = async () => ({ data: { token: "t", expiresIn: 3600 } });
    beds24Service.client.request = async () => {
      if (++calls === 1) {
        const e = new Error("slow down");
        e.response = { status: 429, data: {}, headers: { "x-fivemincreditlimitresetsin": "7" } };
        throw e;
      }
      return { data: { done: true } };
    };
    beds24Service.accessToken = null;
    const res = await beds24Service.request("GET", "/x");
    global.setTimeout = realSetTimeout;
    assert.ok(res.done);
    assert.ok(waits.includes(7500), `waited ${waits}`);
  });

  console.log("Availability and prices");

  await test("counts domes per night from bookings and blocks", async () => {
    resetDb();
    const d = future(5);
    await addWebBooking(d, future(8), 2); // nights 5,6,7
    await db.CalendarAvailability.create({ podId: "pA", date: future(6), status: "blocked" });
    const { map } = await ari.computeAvailabilityMap(future(4), future(8));
    assert.equal(map[future(4)], 6);
    assert.equal(map[future(5)], 4);
    assert.equal(map[future(6)], 3);
    assert.equal(map[future(7)], 4);
    assert.equal(map[future(8)], 6);
  });

  await test("pending bookings past expiry and cancelled bookings do not hold a dome", async () => {
    resetDb();
    await db.Booking.create({ bookingStatus: "pending", expiresAt: new Date(Date.now() - 60000), checkIn: future(5), checkOut: future(6), podsCount: 1 });
    await db.Booking.create({ bookingStatus: "cancelled", checkIn: future(5), checkOut: future(6), podsCount: 1 });
    await db.Booking.create({ bookingStatus: "pending", expiresAt: new Date(Date.now() + 60000), checkIn: future(5), checkOut: future(6), podsCount: 1 });
    const { map } = await ari.computeAvailabilityMap(future(5), future(5));
    assert.equal(map[future(5)], 5);
  });

  await test("beds24-subtracts mode leaves out bookings imported from Beds24", async () => {
    resetDb();
    await addWebBooking(future(5), future(6));
    const imported = await addWebBooking(future(5), future(6));
    await db.Beds24BookingMap.create({ bookingId: imported.id, beds24BookingId: "1" });
    beds24Config.availMode = "absolute";
    assert.equal((await ari.computeAvailabilityMap(future(5), future(5))).map[future(5)], 4);
    beds24Config.availMode = "beds24-subtracts";
    assert.equal((await ari.computeAvailabilityMap(future(5), future(5))).map[future(5)], 5);
    beds24Config.availMode = "absolute";
  });

  await test("prices are the pre-tax base: peak Fri-Sat vs off-peak", async () => {
    const rates = await ari.computeRatesMap("2026-12-04", "2026-12-07"); // Fri..Mon
    assert.equal(rates["2026-12-04"].price1, 400000); // Fri peak
    assert.equal(rates["2026-12-04"].price2, 550000);
    assert.equal(rates["2026-12-06"].price1, 300000); // Sun off-peak
    assert.equal(rates["2026-12-06"].price2, 400000);
  });

  await test("merges consecutive identical nights into one calendar entry", async () => {
    const avail = { "2026-12-01": 6, "2026-12-02": 6, "2026-12-03": 5, "2026-12-04": 5 };
    const rates = {};
    for (const d of Object.keys(avail)) rates[d] = { price1: 300000, price2: 400000 };
    const entries = ari.buildCalendarEntries(avail, rates);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0], { from: "2026-12-01", to: "2026-12-02", numAvail: 6, minStay: 1, price1: 300000, price2: 400000 });
    assert.equal(entries[1].numAvail, 5);
  });

  await test("push sends batches and surfaces a Beds24 rejection", async () => {
    resetDb();
    const sent = [];
    beds24Service.pushCalendar = async (entries) => {
      sent.push(entries);
      return [{ success: true }];
    };
    const r = await ari.pushAriToBeds24({ dateFrom: future(1), dateTo: future(3) });
    assert.ok(r.success);
    assert.equal(sent.length, 1);

    beds24Service.pushCalendar = async () => [{ success: false, errors: ["bad"] }];
    await assert.rejects(() => ari.pushAriToBeds24({ dateFrom: future(1), dateTo: future(3) }), /rejected/);
  });

  await test("a single-night block pushes that night (old code skipped it)", async () => {
    resetDb();
    const sent = [];
    beds24Service.pushCalendar = async (entries) => {
      sent.push(...entries);
      return [{ success: true }];
    };
    const d = future(3);
    await ari.triggerAriPushForStay(d, d);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, d);
    assert.equal(sent[0].to, d);
  });

  await test("failed push retries in the background, then emails the admin once", async () => {
    resetDb();
    let calls = 0;
    beds24Service.pushCalendar = async () => {
      calls++;
      throw new Error("boom");
    };
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => realSetTimeout(fn, 5);
    const r = await ari.triggerAriPushForStay(future(2), future(4));
    assert.ok(r.retrying);
    await tick(150);
    global.setTimeout = realSetTimeout;
    assert.equal(calls, 3); // first try plus two retries
    assert.deepEqual(mails, ["Availability update to Beds24 is failing"]);
  });

  await test("retry stops and sends no email once a retry succeeds", async () => {
    mails.length = 0;
    let n = 0;
    retryInBackground(async () => {
      if (++n < 2) throw new Error("again");
    }, { label: "t", firstError: "x", delays: [5, 5], onGiveUp: () => mails.push("gave up") });
    await tick(80);
    assert.equal(n, 2);
    assert.equal(mails.length, 0);
  });

  console.log("Booking import");

  beds24Service.pushCalendar = async () => [{ success: true }];

  await test("imports a new booking with guest, source, price and calendar rows", async () => {
    resetDb();
    const out = await importer.processBooking(beds24Raw());
    assert.equal(out.action, "created");
    assert.equal(out.overbooked, false);
    const b = db.Booking.rows[0];
    assert.equal(b.bookingSource, "booking.com");
    assert.equal(b.bookingStatus, "confirmed_unassigned");
    assert.equal(b.totalPrice, 900000);
    assert.equal(b.guestsCount, 3);
    assert.equal(db.CalendarAvailability.rows.length, 2);
    assert.equal(db.Beds24BookingMap.rows[0].beds24BookingId, "9001");
    assert.equal(mails.length, 0);
  });

  await test("the same booking read again is unchanged (no duplicate)", async () => {
    const out = await importer.processBooking(beds24Raw());
    assert.equal(out.action, "unchanged");
    assert.equal(db.Booking.rows.length, 1);
  });

  await test("a changed booking updates dates and moves the calendar rows", async () => {
    const out = await importer.processBooking(
      beds24Raw({ departure: future(14), modifiedTime: "2026-11-16T11:00:00Z" }),
    );
    assert.equal(out.action, "modified");
    assert.equal(db.Booking.rows.length, 1);
    assert.equal(ymdOf(db.Booking.rows[0].checkOut), future(14));
    assert.equal(db.CalendarAvailability.rows.length, 4);
  });

  await test("a cancelled booking is cancelled in Lufasi and frees the dates", async () => {
    const out = await importer.processBooking(
      beds24Raw({ status: "cancelled", modifiedTime: "2026-11-16T12:00:00Z" }),
    );
    assert.equal(out.action, "cancelled");
    assert.equal(db.Booking.rows[0].bookingStatus, "cancelled");
    assert.equal(db.CalendarAvailability.rows.length, 0);
  });

  await test("cancelling an unknown booking, and request/inquiry/black statuses, are ignored", async () => {
    resetDb();
    assert.equal((await importer.processBooking(beds24Raw({ id: 1, status: "cancelled" }))).action, "ignored");
    for (const [i, s] of ["request", "inquiry", "black"].entries()) {
      assert.equal((await importer.processBooking(beds24Raw({ id: 10 + i, status: s }))).action, "ignored");
    }
    assert.equal(db.Booking.rows.length, 0);
  });

  await test("stays already over are not imported on the first sync", async () => {
    resetDb();
    const out = await importer.processBooking(beds24Raw({ id: 5, arrival: future(-10), departure: future(-8) }));
    assert.equal(out.action, "ignored");
  });

  await test("no free dome: still imported, flagged OVERBOOKED, no calendar rows, one email", async () => {
    resetDb();
    for (let i = 0; i < 6; i++) await addWebBooking(future(10), future(12));
    const out = await importer.processBooking(beds24Raw());
    assert.equal(out.action, "created");
    assert.equal(out.overbooked, true);
    assert.equal(db.CalendarAvailability.rows.length, 0);
    assert.ok(db.BookingLog.rows[0].action.startsWith("OVERBOOKED"));
    await tick();
    assert.deepEqual(mails, ["OVERBOOKED: booking.com booking LUF-B24-9001"]);
    const again = await importer.processBooking(beds24Raw());
    assert.equal(again.action, "unchanged");
    await tick();
    assert.equal(mails.length, 1);
  });

  await test("a calendar row already on that dome is never clashed with", async () => {
    resetDb();
    const pod = db.Pod.rows[0];
    await db.CalendarAvailability.create({ podId: pod.id, date: future(10), status: "booked", bookingId: "other" });
    await importer.processBooking(beds24Raw());
    const mine = db.CalendarAvailability.rows.filter((r) => r.bookingId !== "other");
    assert.equal(mine.length, 1);
    assert.equal(ymdOf(mine[0].date), future(11));
  });

  await test("pull imports only what Beds24 returns and holds the window open on failure", async () => {
    resetDb();
    beds24Service.getBookingsModifiedSince = async () => [beds24Raw({ id: 1 }), { id: 2, status: "confirmed", arrival: future(5), departure: future(5) }];
    const r = await importer.pullBookings();
    assert.equal(r.created, 1);
    assert.equal(r.failures.length, 1);
    assert.match(r.failures[0].error, /invalid dates/);
    assert.ok(r.pulledUntil);
    await tick();
    assert.ok(mails.includes("Beds24 booking import failed"));
  });

  console.log("Webhook");

  const call = (req) =>
    new Promise((resolve) => {
      const res = {
        statusCode: 200,
        status(c) {
          this.statusCode = c;
          return this;
        },
        json(b) {
          resolve({ status: this.statusCode, body: b });
        },
      };
      controller.handleWebhook(req, res, (e) => resolve({ error: e }));
    });

  await test("rejects a wrong or missing secret and accepts the right one (header or query)", async () => {
    assert.equal((await call({ headers: {}, query: {} })).status, 401);
    assert.equal((await call({ headers: {}, query: { secret: "nope" } })).status, 401);
    beds24Service.getBookingsModifiedSince = async () => [];
    assert.equal((await call({ headers: {}, query: { secret: "s3cret" } })).status, 200);
    assert.equal((await call({ headers: { "x-webhook-secret": "s3cret" }, query: {} })).status, 200);
  });

  await test("rejects everything when no secret is configured", async () => {
    beds24Config.webhookSecret = "";
    assert.equal((await call({ headers: {}, query: { secret: "" } })).status, 503);
    beds24Config.webhookSecret = "s3cret";
  });

  console.log(`\n${passed} checks passed${process.exitCode ? ", with failures" : ""}`);
  await tick(200);
  process.exit(process.exitCode || 0);
})();
