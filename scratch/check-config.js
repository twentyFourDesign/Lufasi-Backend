const db = require("../src/models");

async function checkConfig() {
  try {
    const config = await db.PricingConfiguration.findByPk(1);
    console.log("Pricing Configuration:", JSON.stringify(config, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkConfig();
