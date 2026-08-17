const { DataTypes } = require("sequelize");

async function ensureAlcoholPackageColumn(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  let description;
  try {
    description = await queryInterface.describeTable("bookings");
  } catch (e) {
    console.warn(
      "[ensureAlcoholPackageColumn] Could not describe bookings:",
      e.message,
    );
    return;
  }

  const hasIncluded =
    description.alcohol_package_included != null ||
    description.alcoholPackageIncluded != null;
  const hasCredit =
    description.alcohol_opt_out_credit != null ||
    description.alcoholOptOutCredit != null;

  if (!hasIncluded) {
    await queryInterface.addColumn("bookings", "alcohol_package_included", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    console.log(
      '[ensureAlcoholPackageColumn] Added "bookings"."alcohol_package_included"',
    );
  }

  if (!hasCredit) {
    await queryInterface.addColumn("bookings", "alcohol_opt_out_credit", {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
    console.log(
      '[ensureAlcoholPackageColumn] Added "bookings"."alcohol_opt_out_credit"',
    );
  }
}

module.exports = { ensureAlcoholPackageColumn };
