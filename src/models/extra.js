const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Extra",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(150) },
      description: { type: DataTypes.TEXT },
      price: { type: DataTypes.DECIMAL(12, 2) },
      category: { type: DataTypes.STRING(100) },
      imageUrl: { type: DataTypes.TEXT },
    },
    { tableName: "extras" }
  );
};
