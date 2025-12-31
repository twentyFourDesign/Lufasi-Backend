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
        type: DataTypes.ENUM("initiated", "successful", "failed", "abandoned"),
      },
      transactionReference: { type: DataTypes.STRING(100) },
      paidAt: { type: DataTypes.DATE },
      // Fields for payment gateway tracking
      gateway: {
        type: DataTypes.ENUM("paystack", "squadco", "mock"),
        defaultValue: "paystack",
      },
      gatewayReference: { type: DataTypes.STRING(255), allowNull: true },
      gatewayResponse: { type: DataTypes.JSONB, allowNull: true },
      // Field for webhook idempotency
      webhookProcessedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "booking_payments" }
  );
};
