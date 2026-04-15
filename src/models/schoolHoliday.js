module.exports = (sequelize, DataTypes) => {
  const SchoolHoliday = sequelize.define(
    "SchoolHoliday",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
    },
    {
      tableName: "school_holidays",
      timestamps: true,
    }
  );

  return SchoolHoliday;
};
