const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "PricingConfiguration",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      basePricePerPod: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "base_price_per_pod",
      },
      extraGuestFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: "extra_guest_fee",
      },
      maxGuestsPerPod: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "max_guests_per_pod",
      },
      minGuestsPerPod: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "min_guests_per_pod",
      },
      totalPodsAvailable: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "total_pods_available",
      },
      twelveGuestDiscountPercent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: "twelve_guest_discount_percent",
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      basePricePerPodPeak: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "base_price_per_pod_peak",
      },
      basePricePerPodOffPeak: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "base_price_per_pod_off_peak",
      },
      extraGuestFeePeak: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "extra_guest_fee_peak",
      },
      extraGuestFeeOffPeak: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "extra_guest_fee_off_peak",
      },
      weekdayPeakPercent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0,
        field: "weekday_peak_percent",
      },
      weekdayOffPeakPercent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0,
        field: "weekday_off_peak_percent",
      },
    },
    {
      tableName: "pricing_configurations",
    },
  );
};
