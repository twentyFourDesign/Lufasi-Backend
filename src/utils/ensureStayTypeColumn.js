const { DataTypes } = require("sequelize");

async function ensureStayTypeColumn(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  let description;
  try {
    description = await queryInterface.describeTable("bookings");
  } catch (e) {
    console.warn(
      "[ensureStayTypeColumn] Could not describe bookings:",
      e.message,
    );
    return;
  }

  const hasStayType =
    description.stay_type != null || description.stayType != null;

  if (!hasStayType) {
    await queryInterface.addColumn("bookings", "stay_type", {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "overnight",
    });
    console.log('[ensureStayTypeColumn] Added "bookings"."stay_type"');
  }
}

module.exports = { ensureStayTypeColumn };
