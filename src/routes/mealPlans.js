const express = require("express");
const router = express.Router();
const mealPlanController = require("../controllers/mealPlanController");
const { adminAuth } = require("../middleware/auth");

router.get("/", mealPlanController.getMealPlans);
router.get("/board-type/:boardType", mealPlanController.getMealPlanByBoardType);
router.get("/:id", mealPlanController.getMealPlan);
// router.post("/", adminAuth, mealPlanController.createMealPlan);
router.put("/:id", adminAuth, mealPlanController.updateMealPlan);
// router.delete("/:id", adminAuth, mealPlanController.deleteMealPlan);

module.exports = router;

