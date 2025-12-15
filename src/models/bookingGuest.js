const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "BookingGuest",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingId: { type: DataTypes.UUID },
      adults: { type: DataTypes.INTEGER, defaultValue: 1 },
      children: { type: DataTypes.INTEGER, defaultValue: 0 },
      toddlers: { type: DataTypes.INTEGER, defaultValue: 0 },
      infants: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    { tableName: "booking_guests" }
  );
};
