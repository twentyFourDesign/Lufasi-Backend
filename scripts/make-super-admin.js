/**
 * Give an existing user the Super Admin role (or take it away).
 *
 *   node scripts/make-super-admin.js someone@example.com
 *   node scripts/make-super-admin.js someone@example.com --revoke   (back to Admin)
 *
 * Super Admins are the only users who can open the Service Charge report and
 * the only ones who can create, change or delete other Super Admins, so the
 * first one has to be set here, by someone with access to the server.
 */
require("dotenv").config();
const db = require("../src/models");
const { ensureSuperAdminRole } = require("../src/utils/ensureSuperAdminRole");

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke");
  if (!email || email.startsWith("--")) {
    console.error("Usage: node scripts/make-super-admin.js <email> [--revoke]");
    process.exit(1);
  }

  await db.sequelize.authenticate();
  await ensureSuperAdminRole(db.sequelize);

  const user = await db.User.findOne({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  if (revoke) {
    const supers = await db.User.count({ where: { role: "super_admin" } });
    if (user.role === "super_admin" && supers <= 1) {
      console.error("That is the only Super Admin; make another one first.");
      process.exit(1);
    }
    user.role = "admin";
  } else {
    user.role = "super_admin";
  }
  await user.save();
  console.log(`${user.email} is now ${user.role}.`);
  await db.sequelize.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
