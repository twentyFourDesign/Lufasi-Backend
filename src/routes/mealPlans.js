const express = require("express");
const router = express.Router();
const mealPlanController = require("../controllers/mealPlanController");

router.get("/", mealPlanController.getMealPlans);
router.get("/board-type/:boardType", mealPlanController.getMealPlanByBoardType);
router.get("/:id", mealPlanController.getMealPlan);

module.exports = router;
