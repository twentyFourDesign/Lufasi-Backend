const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "PodImage",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      podId: { type: DataTypes.UUID, allowNull: false },
      imageUrl: { type: DataTypes.TEXT, allowNull: false },
      sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
      isPrimary: { type: DataTypes.BOOLEAN, defaultValue: false },
      caption: { type: DataTypes.STRING(255) },
    },
    {
      tableName: "pod_images",
      timestamps: false,
    }
  );
};

