const { DataTypes } = require("sequelize");

/**
 * Adds columns for per-extra guest detail boxes (e.g. Flower Petals).
 */
async function ensurePersonalizationColumns(sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const extrasDesc = await queryInterface.describeTable("extras");
    const hasRequires =
      extrasDesc.requires_guest_details != null ||
      extrasDesc.requiresguestdetails != null ||
      extrasDesc.requiresGuestDetails != null;
    const hasPrompt =
      extrasDesc.details_prompt != null ||
      extrasDesc.detailsprompt != null ||
      extrasDesc.detailsPrompt != null;

    if (!hasRequires) {
      await queryInterface.addColumn("extras", "requires_guest_details", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      console.log(
        '[ensurePersonalizationColumns] Added "extras"."requiresGuestDetails"',
      );
    }

    if (!hasPrompt) {
      await queryInterface.addColumn("extras", "details_prompt", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
      console.log('[ensurePersonalizationColumns] Added "extras"."detailsPrompt"');
    }
  } catch (e) {
    console.warn(
      "[ensurePersonalizationColumns] Could not update extras table:",
      e.message,
    );
  }

  try {
    const bookingsDesc = await queryInterface.describeTable("bookings");
    const hasPersonalizations =
      bookingsDesc.extraPersonalizations != null ||
      bookingsDesc.extrapersonalizations != null;

    if (!hasPersonalizations) {
      await queryInterface.addColumn("bookings", "extra_personalizations", {
        type: DataTypes.JSON,
        allowNull: true,
      });
      console.log(
        '[ensurePersonalizationColumns] Added "bookings"."extra_personalizations"',
      );
    }
  } catch (e) {
    console.warn(
      "[ensurePersonalizationColumns] Could not update bookings table:",
      e.message,
    );
  }
}

module.exports = { ensurePersonalizationColumns };
