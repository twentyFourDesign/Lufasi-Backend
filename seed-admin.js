require("dotenv").config();
const { Sequelize } = require("sequelize");
const bcrypt = require("bcrypt");
const defineUser = require("./src/models/user");

async function seedAdmin() {
  const sequelize = new Sequelize(process.env.SUPABASE_DB_URL, {
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  });

  const User = defineUser(sequelize);

  try {
    await sequelize.authenticate();
    console.log("Connected to database.");

    // Sync the users table specifically
    await User.sync();

    const email = "vishurizz0@gmail.com";
    const password = "vishuisme";
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [user, created] = await User.findOrCreate({
      where: { email },
      defaults: {
        fullName: "Vishu Admin",
        passwordHash,
        role: "admin",
      },
    });

    if (created) {
      console.log(`✅ Admin user created: ${email}`);
    } else {
      // Update existing user to ensure role and password are correct
      user.passwordHash = passwordHash;
      user.role = "admin";
      await user.save();
      console.log(`✅ Admin user updated: ${email}`);
    }
  } catch (error) {
    console.error("❌ Error seeding admin:", error);
  } finally {
    await sequelize.close();
  }
}

seedAdmin();
