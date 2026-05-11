const { DataTypes } = require("sequelize");

/**
 * extras.categoryTitle / categorySubtitle were added in code without a migration runner.
 * Adds missing columns on startup so Supabase/PgBouncer setups do not 42703 on SELECT.
 */
async function ensureExtrasCategoryColumns(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  let description;
  try {
    description = await queryInterface.describeTable("extras");
  } catch (e) {
    console.warn(
      "[ensureExtrasCategoryColumns] Could not describe extras table:",
      e.message,
    );
    return;
  }

  const hasTitle =
    description.categoryTitle != null || description.categorytitle != null;
  const hasSubtitle =
    description.categorySubtitle != null ||
    description.categorysubtitle != null;

  if (!hasTitle) {
    await queryInterface.addColumn("extras", "categoryTitle", {
      type: DataTypes.STRING(200),
      allowNull: true,
    });
    console.log('[ensureExtrasCategoryColumns] Added column "extras"."categoryTitle"');
  }

  if (!hasSubtitle) {
    await queryInterface.addColumn("extras", "categorySubtitle", {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    console.log('[ensureExtrasCategoryColumns] Added column "extras"."categorySubtitle"');
  }
}

module.exports = { ensureExtrasCategoryColumns };
