const express = require("express");
const router = express.Router();
const extraController = require("../controllers/extraController");
const { adminAuth } = require("../middleware/auth");

router.get("/", extraController.listExtras);
router.get("/by-category", extraController.getExtrasByCategory);
router.post("/", adminAuth, extraController.createExtra);
router.put("/:id", adminAuth, extraController.updateExtra);
router.delete("/:id", adminAuth, extraController.deleteExtra);

module.exports = router;

