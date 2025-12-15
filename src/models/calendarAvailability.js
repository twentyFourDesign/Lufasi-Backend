const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "CalendarAvailability",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      podId: { type: DataTypes.UUID },
      date: { type: DataTypes.DATEONLY },
      status: {
        type: DataTypes.ENUM("available", "booked", "blocked"),
        defaultValue: "available",
      },
      bookingId: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "calendar_availabilities",
      indexes: [{ fields: ["podId", "date"] }],
    }
  );
};
