const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "PodPriceRule",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      podId: { type: DataTypes.UUID },
      guestType: {
        type: DataTypes.ENUM("adult", "child", "toddler", "infant"),
      },
      pricePercentage: { type: DataTypes.DECIMAL(5, 2) },
    },
    { tableName: "pod_price_rules" }
  );
};
