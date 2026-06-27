const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Extra",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(150) },
      description: { type: DataTypes.TEXT },
      price: { type: DataTypes.DECIMAL(12, 2) },
      category: { type: DataTypes.STRING(100) },
      /** Shown on booking extras step for this category (synced across all extras in the category). */
      categoryTitle: { type: DataTypes.STRING(200), allowNull: true },
      categorySubtitle: { type: DataTypes.TEXT, allowNull: true },
      /** When true, guests see a details box (like Welcome Note) when this extra is selected. */
      requiresGuestDetails: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "requires_guest_details",
      },
      /** Placeholder / helper shown in the guest details box. */
      detailsPrompt: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "details_prompt",
      },
      /** When true, guests must pick which stay night(s) the extra applies to (e.g. massage). */
      requiresDateSelection: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "requires_date_selection",
      },
      imageUrl: { type: DataTypes.TEXT },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "extras" }
  );
};

