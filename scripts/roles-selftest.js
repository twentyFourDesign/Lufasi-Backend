/**
 * Offline self-test for role access (Super Admin / Admin / Staff).
 * No database: the User model is an in-memory fake.  Run: node scripts/roles-selftest.js
 */
process.env.JWT_SECRET = "test-secret";
const assert = require("assert");
const path = require("path");
const Module = require("module");
const jwt = require("jsonwebtoken");

const users = [];
const db = {
  User: {
    async findByPk(id) { return users.find((u) => u.id === id) || null; },
    async findOne({ where }) { return users.find((u) => u.email === where.email) || null; },
    async count({ where }) { return users.filter((u) => u.role === where.role).length; },
    async create(o) {
      const u = { id: `u${users.length + 1}`, ...o, async save() {}, async destroy() { users.splice(users.indexOf(this), 1); } };
      users.push(u);
      return u;
    },
  },
};
const origLoad = Module._load;
Module._load = function (r, ...a) {
  if (r === "../models") return db;
  return origLoad.call(this, r, ...a);
};
const src = (p) => path.join(__dirname, "..", "src", p);
const { adminAuth, adminOnlyAuth, superAdminAuth } = require(src("middleware/auth"));
const ctl = require(src("controllers/authController"));

const seed = (id, role) => { users.push({ id, role, email: `${id}@t`, async save() {}, async destroy() { users.splice(users.indexOf(this), 1); } }); };
const tokenFor = (id) => `Bearer ${jwt.sign({ id }, "test-secret")}`;

async function through(mw, header) {
  let out;
  const r = { code: 200, status(c) { this.code = c; return this; }, json(b) { out = { code: this.code, body: b }; } };
  let passed = false;
  await mw({ headers: header ? { authorization: header } : {} }, r, () => { passed = true; });
  return passed ? { code: 200, passed: true } : out;
}
async function call(fn, req) {
  let out;
  const r = { code: 200, status(c) { this.code = c; return this; }, json(b) { out = { code: this.code, body: b }; } };
  await fn(req, r, (e) => { throw e; });
  return out;
}

let n = 0;
async function test(name, fn) {
  try { await fn(); n++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack}`); process.exitCode = 1; }
}

(async () => {
  seed("sa", "super_admin"); seed("sa2", "super_admin"); seed("ad", "admin"); seed("st", "staff");

  await test("Service Charge guard: only a Super Admin gets through", async () => {
    assert.equal((await through(superAdminAuth, tokenFor("sa"))).passed, true);
    assert.equal((await through(superAdminAuth, tokenFor("ad"))).code, 403);
    assert.equal((await through(superAdminAuth, tokenFor("st"))).code, 403);
    assert.equal((await through(superAdminAuth)).code, 401);
    assert.equal((await through(superAdminAuth, "Bearer nonsense")).code, 401);
  });

  await test("a demoted user loses access immediately (role read from the database)", async () => {
    const tok = tokenFor("sa2");
    assert.equal((await through(superAdminAuth, tok)).passed, true);
    users.find((u) => u.id === "sa2").role = "admin";
    assert.equal((await through(superAdminAuth, tok)).code, 403);
    users.find((u) => u.id === "sa2").role = "super_admin";
  });

  await test("Super Admin keeps all Admin and staff access", async () => {
    assert.equal((await through(adminAuth, tokenFor("sa"))).passed, true);
    assert.equal((await through(adminOnlyAuth, tokenFor("sa"))).passed, true);
    assert.equal((await through(adminOnlyAuth, tokenFor("ad"))).passed, true);
    assert.equal((await through(adminOnlyAuth, tokenFor("st"))).code, 403);
  });

  await test("only a Super Admin can create a Super Admin", async () => {
    const body = { fullName: "N", email: "n@t", password: "pw", role: "super_admin" };
    const bcrypt = require("bcrypt");
    assert.equal((await call(ctl.createAdmin, { body, admin: users.find((u) => u.id === "ad") })).code, 403);
    assert.equal((await call(ctl.createAdmin, { body: { ...body, email: "n2@t" }, admin: users.find((u) => u.id === "sa") })).code, 201);
    assert.ok(bcrypt);
  });

  await test("an Admin cannot edit, promote into, or take over a Super Admin account", async () => {
    const admin = users.find((u) => u.id === "ad");
    assert.equal((await call(ctl.updateAdmin, { params: { id: "sa" }, body: { password: "x" }, admin })).code, 403);
    assert.equal((await call(ctl.updateAdmin, { params: { id: "ad" }, body: { role: "super_admin" }, admin })).code, 403);
    assert.equal((await call(ctl.updateAdmin, { params: { id: "st" }, body: { phone: "1" }, admin })).code, 200);
  });

  await test("a Super Admin can promote and demote, but never the last Super Admin", async () => {
    const sa = users.find((u) => u.id === "sa");
    assert.equal((await call(ctl.updateAdmin, { params: { id: "st" }, body: { role: "super_admin" }, admin: sa })).code, 200);
    // remove the other Super Admins so "sa" is the only one
    for (const id of users.filter((u) => u.role === "super_admin" && u.id !== "sa").map((u) => u.id)) users.splice(users.findIndex((u) => u.id === id), 1);
    assert.equal((await call(ctl.updateAdmin, { params: { id: "sa" }, body: { role: "admin" }, admin: sa })).code, 400);
  });

  await test("deleting: Admin cannot delete a Super Admin; the last one cannot be deleted", async () => {
    const admin = users.find((u) => u.id === "ad");
    assert.equal((await call(ctl.deleteAdmin, { params: { id: "sa" }, admin })).code, 403);
    seed("sa3", "super_admin");
    const sa3 = users.find((u) => u.id === "sa3");
    assert.equal((await call(ctl.deleteAdmin, { params: { id: "sa" }, admin: sa3 })).code, 200); // two existed
    assert.equal((await call(ctl.deleteAdmin, { params: { id: "sa3" }, admin: users.find((u) => u.id !== "sa3" && u.role === "super_admin") || sa3 })).code, 400); // self or last
  });

  await test("Super Admin can log in", async () => {
    seed("lg", "super_admin");
    const bcrypt = require("bcrypt");
    const hash = await bcrypt.hash("pw", 4);
    const u = users.find((x) => x.id === "lg");
    u.email = "lg@t"; u.validPassword = (p) => bcrypt.compare(p, hash);
    const out = await call(ctl.adminLogin, { body: { email: "lg@t", password: "pw" } });
    assert.equal(out.code, 200);
    assert.equal(out.body.user.role, "super_admin");
  });

  console.log(`\n${n} checks passed${process.exitCode ? ", with failures" : ""}`);
})();
