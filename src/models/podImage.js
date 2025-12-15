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
      podId: { type: DataTypes.UUID },
      imageUrl: { type: DataTypes.TEXT },
    },
    { tableName: "pod_images" }
  );
};
