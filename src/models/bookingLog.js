const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "BookingLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingId: { type: DataTypes.UUID },
      action: { type: DataTypes.STRING(255) },
      oldStatus: { type: DataTypes.STRING(50) },
      newStatus: { type: DataTypes.STRING(50) },
      ipAddress: { type: DataTypes.STRING(100) },
      userAgent: { type: DataTypes.TEXT },
      timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "booking_logs" }
  );
};
