const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "MealPlan",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      boardType: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "board_type",
        validate: {
          isIn: [["fullBoard", "halfBoard"]],
        },
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      subtitle: {
        type: DataTypes.TEXT,
      },
      items: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_active",
      },
    },
    {
      tableName: "meal_plans",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["board_type"],
        },
      ],
    }
  );
};
