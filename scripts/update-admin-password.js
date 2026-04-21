require("dotenv").config();
const db = require("../src/models");
const bcrypt = require("bcrypt");

async function updateAdminPassword() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log("Usage: node scripts/update-admin-password.js <email> <new_password>");
    console.log("Example: node scripts/update-admin-password.js \"admin@lufasi.com\" \"newpassword123\"");
    process.exit(1);
  }

  const [email, password] = args;

  try {
    await db.sequelize.authenticate();
    console.log("✅ Connected to database.");

    const user = await db.User.findOne({ where: { email } });

    if (!user) {
      console.log(`❌ User with email ${email} not found.`);
      process.exit(1);
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    user.passwordHash = passwordHash;
    // Ensure the user is an admin if they weren't already, per the requirement of "update password for a email of admin"
    if (user.role !== "admin") {
      console.log(`ℹ️ User role was ${user.role}, updating to admin.`);
      user.role = "admin";
    }

    await user.save();

    console.log(`✅ Password and role updated successfully for: ${email}`);
  } catch (error) {
    console.error("❌ Error updating password:", error);
  } finally {
    await db.sequelize.close();
  }
}

updateAdminPassword();
