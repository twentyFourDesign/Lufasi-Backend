const { DataTypes } = require("sequelize");

async function ensureWeekdayPeakColumns(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  let description;
  try {
    description = await queryInterface.describeTable("pricing_configurations");
  } catch (e) {
    console.warn(
      "[ensureWeekdayPeakColumns] Could not describe pricing_configurations:",
      e.message,
    );
    return;
  }

  const hasPeak =
    description.weekday_peak_percent != null ||
    description.weekdayPeakPercent != null;
  const hasOff =
    description.weekday_off_peak_percent != null ||
    description.weekdayOffPeakPercent != null;

  if (!hasPeak) {
    await queryInterface.addColumn(
      "pricing_configurations",
      "weekday_peak_percent",
      {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0,
      },
    );
    console.log(
      '[ensureWeekdayPeakColumns] Added "pricing_configurations"."weekday_peak_percent"',
    );
  }

  if (!hasOff) {
    await queryInterface.addColumn(
      "pricing_configurations",
      "weekday_off_peak_percent",
      {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0,
      },
    );
    console.log(
      '[ensureWeekdayPeakColumns] Added "pricing_configurations"."weekday_off_peak_percent"',
    );
  }
}

module.exports = { ensureWeekdayPeakColumns };
