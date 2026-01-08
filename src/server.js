require("dotenv").config();
const app = require("./app");
const db = require("./models");

const PORT = process.env.PORT || 4000;

async function init() {
  try {
    // Sync database -- in production, replace with migrations
    await db.sequelize.authenticate();
    console.log("Database connected.");
    if (process.env.NODE_ENV !== 'production') {
      await db.sequelize.sync();
      console.log("Database synced.");
    }



    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

init();
