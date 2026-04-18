require("dotenv").config();
const db = require("../src/models");
const bcrypt = require("bcrypt");

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log("Usage: node scripts/create-admin.js vishu dev@admin.com dev-vishu");
    console.log("Example: node scripts/create-admin.js \"Admin User\" \"admin@lufasi.com\" \"mypassword123\"");
    process.exit(1);
  }

  const [name, email, password] = args;

  try {
    await db.sequelize.authenticate();
    console.log("✅ Connected to database.");

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [user, created] = await db.User.findOrCreate({
      where: { email },
      defaults: {
        fullName: name,
        passwordHash,
        role: "admin",
      },
    });

    if (created) {
      console.log(`✅ Admin user created successfully!`);
      console.log(`Email: ${email}`);
      console.log(`Role: ${user.role}`);
    } else {
      console.log(`⚠️ User with email ${email} already exists.`);
      console.log(`Updating user to admin and resetting password...`);
      
      user.fullName = name;
      user.passwordHash = passwordHash;
      user.role = "admin";
      await user.save();
      
      console.log(`✅ Admin user updated successfully!`);
    }
  } catch (error) {
    console.error("❌ Error creating admin:", error);
  } finally {
    await db.sequelize.close();
  }
}

createAdmin();
