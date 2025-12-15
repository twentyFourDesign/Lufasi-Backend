const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "BookingExtra",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingId: { type: DataTypes.UUID },
      extraId: { type: DataTypes.UUID },
      quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
      totalPrice: { type: DataTypes.DECIMAL(12, 2) },
    },
    { tableName: "booking_extras" }
  );
};
