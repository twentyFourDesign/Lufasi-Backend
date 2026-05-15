const { DataTypes } = require("sequelize");

const PRICE_COLUMNS = [
  { name: "base_price_per_pod_peak", type: DataTypes.DECIMAL(12, 2) },
  { name: "base_price_per_pod_off_peak", type: DataTypes.DECIMAL(12, 2) },
  { name: "extra_guest_fee_peak", type: DataTypes.DECIMAL(12, 2) },
  { name: "extra_guest_fee_off_peak", type: DataTypes.DECIMAL(12, 2) },
];

async function ensureWeekdayPriceColumns(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  let description;
  try {
    description = await queryInterface.describeTable("pricing_configurations");
  } catch (e) {
    console.warn(
      "[ensureWeekdayPriceColumns] Could not describe pricing_configurations:",
      e.message,
    );
    return;
  }

  for (const col of PRICE_COLUMNS) {
    if (description[col.name] == null) {
      await queryInterface.addColumn("pricing_configurations", col.name, {
        type: col.type,
        allowNull: true,
      });
      console.log(
        `[ensureWeekdayPriceColumns] Added "pricing_configurations"."${col.name}"`,
      );
    }
  }

  // Backfill from legacy single columns when new fields are empty
  await sequelize.query(`
    UPDATE pricing_configurations
    SET
      base_price_per_pod_off_peak = COALESCE(base_price_per_pod_off_peak, base_price_per_pod),
      base_price_per_pod_peak = COALESCE(base_price_per_pod_peak, base_price_per_pod),
      extra_guest_fee_off_peak = COALESCE(extra_guest_fee_off_peak, extra_guest_fee),
      extra_guest_fee_peak = COALESCE(extra_guest_fee_peak, extra_guest_fee)
    WHERE id = 1
  `);
}

module.exports = { ensureWeekdayPriceColumns };
