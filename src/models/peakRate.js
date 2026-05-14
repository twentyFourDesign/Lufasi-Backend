const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "PeakRate",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: "start_date",
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: "end_date",
      },
      // Positive = peak rates (e.g. +20 means 20% more)
      // Negative = off-peak discount (e.g. -15 means 15% less)
      percentageAdjustment: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        field: "percentage_adjustment",
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "is_active",
      },
    },
    {
      tableName: "peak_rates",
      timestamps: true,
    }
  );
};
