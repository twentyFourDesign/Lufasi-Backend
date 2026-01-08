const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "GuestDirectory",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      fullName: { type: DataTypes.STRING(150) },
      email: { type: DataTypes.STRING(150), unique: true },
      phone: { type: DataTypes.STRING(100) },
      identificationType: { type: DataTypes.STRING(50) },
      identificationNumber: { type: DataTypes.STRING(100) },
      dateOfBirth: { type: DataTypes.DATEONLY },
      totalBookings: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    { tableName: "guest_directory" }
  );
};
