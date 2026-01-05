const db = require("../models");
const { v4: uuidv4 } = require("uuid");

async function getMealPlans(req, res, next) {
  try {
    const mealPlans = await db.MealPlan.findAll({
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

    res.json({ mealPlans: formattedPlans });
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
      id: mealPlan.id,
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

async function createMealPlan(req, res, next) {
  try {
    const { boardType, title, subtitle, items, price, isActive } = req.body;

    const mealPlan = await db.MealPlan.create({
      id: uuidv4(),
      boardType,
      title,
      subtitle,
      items: items || [],
      price,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.json({ mealPlan });
  } catch (err) {
    next(err);
  }
}

async function updateMealPlan(req, res, next) {
  try {
    const mealPlan = await db.MealPlan.findByPk(req.params.id);
    if (!mealPlan) return res.status(404).json({ error: "Meal plan not found" });
    await mealPlan.update(req.body);
    res.json({ mealPlan });
  } catch (err) {
    next(err);
  }
}

async function deleteMealPlan(req, res, next) {
  try {
    const mealPlan = await db.MealPlan.findByPk(req.params.id);
    if (!mealPlan) return res.status(404).json({ error: "Meal plan not found" });
    await mealPlan.destroy();
    res.json({ message: "Meal plan deleted successfully" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMealPlans,
  getMealPlan,
  getMealPlanByBoardType,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan
};

