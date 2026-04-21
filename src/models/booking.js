const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Booking",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bookingReference: { type: DataTypes.STRING(20), unique: true },
      guestDirectoryId: { type: DataTypes.UUID },
      podId: { type: DataTypes.UUID },
      checkIn: { type: DataTypes.DATEONLY },
      checkOut: { type: DataTypes.DATEONLY },
      totalPrice: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.0 },
      discountId: { type: DataTypes.UUID, allowNull: true },
      voucherId: { type: DataTypes.UUID, allowNull: true },
      bookingStatus: {
        type: DataTypes.ENUM(
          "pending",
          "paid",
          "failed",
          "abandoned",
          "cancelled",
          "confirmed",
          "expired",
          "confirmed_unassigned",
          "ready_for_checkin",
        ),
        defaultValue: "pending",
      },
      boardType: {
        type: DataTypes.ENUM("fullBoard", "halfBoard"),
        defaultValue: "fullBoard",
      },
      popUpBeds: { type: DataTypes.INTEGER, defaultValue: 0 },
      podCount: { type: DataTypes.INTEGER, defaultValue: 1 },
      guestsCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "guests_count",
      },
      podsCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "pods_count",
      },
      priceSnapshotBase: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "price_snapshot_base",
      },
      priceSnapshotExtra: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "price_snapshot_extra",
      },
      identificationImageUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: "identification_image_url",
      },
      calculatedTotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "calculated_total",
      },
      configBasePricePerPod: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "config_base_price_per_pod",
      },
      configExtraGuestFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: "config_extra_guest_fee",
      },
      configMaxGuestsPerPod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "config_max_guests_per_pod",
      },
      configMinGuestsPerPod: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "config_min_guests_per_pod",
      },
      configTotalPodsAvailable: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "config_total_pods_available",
      },
      configCurrency: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: "config_currency",
      },
      bedConfiguration: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: "bed_configuration",
      },
      twelveGuestDiscountApplied: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "twelve_guest_discount_applied",
      },
      twelveGuestDiscountAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        field: "twelve_guest_discount_amount",
      },
      domeDetails: {
        type: DataTypes.JSON,
        allowNull: true,
        field: "dome_details",
      },
      welcomeNote: {
        type: DataTypes.JSON,
        allowNull: true,
        field: "welcome_note",
      },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "bookings" },
  );
};
