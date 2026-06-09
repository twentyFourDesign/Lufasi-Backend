const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "ChannexBookingMap",
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
      channexBookingId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: "channex_booking_id",
      },
      channexRevisionId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: "channex_revision_id",
      },
      uniqueId: {
        type: DataTypes.STRING(200),
        allowNull: true,
        field: "unique_id",
      },
      otaReservationCode: {
        type: DataTypes.STRING(200),
        allowNull: true,
        field: "ota_reservation_code",
      },
      revisionSystemId: {
        type: DataTypes.STRING(200),
        allowNull: true,
        unique: true,
        field: "revision_system_id",
      },
      otaName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: "ota_name",
      },
      source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "booking.com",
      },
      lastRevisionStatus: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "last_revision_status",
      },
    },
    {
      tableName: "channex_booking_map",
      indexes: [
        { fields: ["booking_id"] },
        { fields: ["channex_booking_id"] },
        { fields: ["ota_reservation_code"] },
      ],
    },
  );
};
