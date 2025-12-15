const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Voucher",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: { type: DataTypes.STRING(50), unique: true },
      value: { type: DataTypes.DECIMAL(12, 2) },
      validFrom: { type: DataTypes.DATEONLY },
      validTo: { type: DataTypes.DATEONLY },
      maxUses: { type: DataTypes.INTEGER, defaultValue: 0 },
      usedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    { tableName: "vouchers" }
  );
};
