const db = require("../models");

async function getMealPlans(req, res, next) {
  try {
    const mealPlans = await db.MealPlan.findAll({
      where: { isActive: true },
      order: [["boardType", "ASC"]],
    });

    // Format for frontend compatibility
    const formattedPlans = mealPlans.map((plan) => ({
      id: plan.id,
      boardType: plan.boardType,
      title: plan.title,
      subtitle: plan.subtitle,
      items: plan.items,
      price: parseFloat(plan.price),
      isActive: plan.isActive,
    }));

    res.json(formattedPlans);
  } catch (err) {
    next(err);
  }
}

async function getMealPlan(req, res, next) {
  try {
    const { id } = req.params;

    const mealPlan = await db.MealPlan.findOne({
      where: {
        [db.Sequelize.Op.or]: [{ id: id }, { boardType: id }],
        isActive: true,
      },
    });

    if (!mealPlan) {
      return res.status(404).json({ error: "Meal plan not found" });
    }

    const formatted = {
      id: mealPlan.boardType,
      boardType: mealPlan.boardType,
      title: mealPlan.title,
      subtitle: mealPlan.subtitle,
      items: mealPlan.items,
      price: parseFloat(mealPlan.price),
      isActive: mealPlan.isActive,
    };

    res.json(formatted);
  } catch (err) {
    next(err);
  }
}

async function getMealPlanByBoardType(req, res, next) {
  try {
    const { boardType } = req.params;

    const mealPlan = await db.MealPlan.findOne({
      where: {
        boardType: boardType,
        isActive: true,
      },
    });

    if (!mealPlan) {
      return res
        .status(404)
        .json({ error: "Meal plan not found for board type" });
    }

    const formatted = {
      id: mealPlan.boardType,
      boardType: mealPlan.boardType,
      title: mealPlan.title,
      subtitle: mealPlan.subtitle,
      items: mealPlan.items,
      price: parseFloat(mealPlan.price),
      isActive: mealPlan.isActive,
    };

    res.json(formatted);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMealPlans, getMealPlan, getMealPlanByBoardType };
