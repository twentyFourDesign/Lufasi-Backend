const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Booking",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingReference: { type: DataTypes.STRING(20), unique: true },
      guestDirectoryId: { type: DataTypes.UUID },
      podId: { type: DataTypes.UUID },
      checkIn: { type: DataTypes.DATEONLY },
      checkOut: { type: DataTypes.DATEONLY },
      totalPrice: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.0 },
      discountId: { type: DataTypes.UUID, allowNull: true },
      voucherId: { type: DataTypes.UUID, allowNull: true },
      bookingStatus: {
        type: DataTypes.ENUM(
          "pending",
          "paid",
          "failed",
          "abandoned",
          "cancelled",
          "confirmed",
          "expired",
          "confirmed_unassigned",
          "ready_for_checkin"
        ),
        defaultValue: "pending",
      },
      boardType: {
        type: DataTypes.ENUM("fullBoard", "halfBoard"),
        defaultValue: "fullBoard",
      },
      popUpBeds: { type: DataTypes.INTEGER, defaultValue: 0 },
      podCount: { type: DataTypes.INTEGER, defaultValue: 1 },
      guestsCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "guests_count",
      },
      podsCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "pods_count",
      },
      priceSnapshotBase: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "price_snapshot_base",
      },
      priceSnapshotExtra: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "price_snapshot_extra",
      },
      calculatedTotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "calculated_total",
      },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "bookings" },
  );
};
