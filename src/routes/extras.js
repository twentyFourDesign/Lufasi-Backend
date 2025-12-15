const express = require("express");
const router = express.Router();
const extraController = require("../controllers/extraController");
const { adminAuth } = require("../middleware/auth");

router.get("/", extraController.listExtras);
router.post("/", adminAuth, extraController.createExtra);
router.put("/:id", adminAuth, extraController.updateExtra);

module.exports = router;
