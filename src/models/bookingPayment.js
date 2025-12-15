const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "BookingPayment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingId: { type: DataTypes.UUID },
      amount: { type: DataTypes.DECIMAL(12, 2) },
      paymentMethod: { type: DataTypes.STRING(100) },
      paymentStatus: {
        type: DataTypes.ENUM("initiated", "successful", "failed"),
      },
      transactionReference: { type: DataTypes.STRING(100) },
      paidAt: { type: DataTypes.DATE },
    },
    { tableName: "booking_payments" }
  );
};
