const { DataTypes } = require("sequelize");

/** Links a Lufasi booking to the Beds24 booking it was imported from. */
module.exports = (sequelize) => {
  return sequelize.define(
    "Beds24BookingMap",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: "booking_id",
      },
      beds24BookingId: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        field: "beds24_booking_id",
      },
      channel: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      apiReference: {
        type: DataTypes.STRING(200),
        allowNull: true,
        field: "api_reference",
      },
      lastStatus: {
        type: DataTypes.STRING(30),
        allowNull: true,
        field: "last_status",
      },
      lastModified: {
        type: DataTypes.STRING(40),
        allowNull: true,
        field: "last_modified",
      },
    },
    {
      tableName: "beds24_booking_map",
      indexes: [{ fields: ["booking_id"] }],
    },
  );
};
