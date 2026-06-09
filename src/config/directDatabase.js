require("dotenv").config();
const { Sequelize } = require("sequelize");

const url = process.env.SUPABASE_DIRECT_DB_URL || process.env.SUPABASE_DB_URL;

if (!url) {
  console.error("❌ Error: SUPABASE_DIRECT_DB_URL or SUPABASE_DB_URL is missing in .env file.");
  process.exit(1);
}

const directSequelize = new Sequelize(url, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

module.exports = directSequelize;
