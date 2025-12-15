const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Payment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingReference: { type: DataTypes.STRING(20) },
      guestName: { type: DataTypes.STRING(150) },
      amount: { type: DataTypes.DECIMAL(12, 2) },
      status: { type: DataTypes.ENUM("paid", "refunded", "reversed") },
    },
    { tableName: "payments" }
  );
};
