const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Pod",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      propertyId: { type: DataTypes.UUID },
      podName: { type: DataTypes.STRING(100) },
      description: { type: DataTypes.TEXT },
      rules: { type: DataTypes.TEXT },
      amenities: { type: DataTypes.TEXT }, // Comma-separated list: "Lake View, Private Pool, King Size Bed"
      baseAdultPrice: { type: DataTypes.DECIMAL(12, 2), defaultValue: 250000 },
      maxAdults: { type: DataTypes.INTEGER, defaultValue: 2 },
      maxChildren: { type: DataTypes.INTEGER, defaultValue: 0 },
      maxToddlers: { type: DataTypes.INTEGER, defaultValue: 0 },
      maxInfants: { type: DataTypes.INTEGER, defaultValue: 2 },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "pods" }
  );
};

