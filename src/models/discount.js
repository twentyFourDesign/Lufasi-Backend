const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Discount",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: { type: DataTypes.STRING(50), unique: true },
      type: { type: DataTypes.ENUM("percentage", "fixed") },
      value: { type: DataTypes.DECIMAL(12, 2) },
      startDate: { type: DataTypes.DATEONLY },
      endDate: { type: DataTypes.DATEONLY },
      minimumNights: { type: DataTypes.INTEGER, defaultValue: 1 },
      maxUses: { type: DataTypes.INTEGER, defaultValue: 0 },
      usedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    { tableName: "discounts" }
  );
};
