const { DataTypes } = require("sequelize");

/**
 * Creates extra_blocked_dates table and requires_date_selection column on extras.
 */
async function ensureExtraBlockedDatesTable(sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const extrasDesc = await queryInterface.describeTable("extras");
    const hasDateSelection =
      extrasDesc.requires_date_selection != null ||
      extrasDesc.requiresDateSelection != null;

    if (!hasDateSelection) {
      await queryInterface.addColumn("extras", "requires_date_selection", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      console.log(
        '[ensureExtraBlockedDatesTable] Added "extras"."requires_date_selection"',
      );
    }
  } catch (e) {
    console.warn(
      "[ensureExtraBlockedDatesTable] Could not update extras table:",
      e.message,
    );
  }

  try {
    await queryInterface.describeTable("extra_blocked_dates");
  } catch {
    await queryInterface.createTable("extra_blocked_dates", {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      extra_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "extras", key: "id" },
        onDelete: "CASCADE",
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
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex("extra_blocked_dates", ["extra_id", "date"], {
      unique: true,
      name: "extra_blocked_dates_extra_id_date_unique",
    });
    await queryInterface.addIndex("extra_blocked_dates", ["category", "date"], {
      unique: true,
      name: "extra_blocked_dates_category_date_unique",
    });

    console.log("[ensureExtraBlockedDatesTable] Created extra_blocked_dates table");
  }
}

module.exports = { ensureExtraBlockedDatesTable };
