const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Property",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(150) },
      description: { type: DataTypes.TEXT },
      location: { type: DataTypes.STRING(255) },
    },
    { tableName: "properties" }
  );
};
