const { DataTypes } = require("sequelize");
const bcrypt = require("bcrypt");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      fullName: { type: DataTypes.STRING(150) },
      email: { type: DataTypes.STRING(150), unique: true },
      phone: { type: DataTypes.STRING(50) },
      passwordHash: { type: DataTypes.TEXT },
      role: {
        type: DataTypes.ENUM("admin", "staff", "guest"),
        defaultValue: "admin",
      },
      identificationType: { type: DataTypes.STRING(50) },
      identificationNumber: { type: DataTypes.STRING(100) },
    },
    { tableName: "users" }
  );

  User.prototype.validPassword = function (password) {
    return bcrypt.compare(password, this.passwordHash);
  };

  return User;
};
