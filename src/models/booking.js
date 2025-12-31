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
          "expired"
        ),
        defaultValue: "pending",
      },
      boardType: {
        type: DataTypes.ENUM("fullBoard", "halfBoard"),
        defaultValue: "fullBoard",
      },
      popUpBeds: { type: DataTypes.INTEGER, defaultValue: 0 },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "bookings" }
  );
};
