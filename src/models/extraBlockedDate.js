module.exports = (sequelize, DataTypes) => {
  const ExtraBlockedDate = sequelize.define(
    "ExtraBlockedDate",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      extraId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: "extra_id",
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "extra_blocked_dates",
      timestamps: true,
    },
  );

  return ExtraBlockedDate;
};
