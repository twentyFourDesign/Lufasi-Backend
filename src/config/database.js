require("dotenv").config();
const { Sequelize } = require("sequelize");

if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ Error: SUPABASE_DB_URL is missing in .env file.");
  console.error("Please add your PostgreSQL connection string to Lufasi-Backend/.env");
  process.exit(1);
}

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

module.exports = sequelize;
