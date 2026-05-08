const express = require("express");
const router = express.Router();
const extraController = require("../controllers/extraController");
const { adminAuth } = require("../middleware/auth");
const { uploaders } = require("../services/uploadService");

router.get("/", extraController.listExtras);
router.get("/by-category", extraController.getExtrasByCategory);
router.post("/", adminAuth, extraController.createExtra);
router.put("/:id", adminAuth, extraController.updateExtra);
router.delete("/:id", adminAuth, extraController.deleteExtra);
router.post(
  "/:id/image",
  adminAuth,
  uploaders.extras.single("image"),
  extraController.updateExtraImage,
);
router.post(
  "/category/:category/image",
  adminAuth,
  uploaders.extras.single("image"),
  extraController.updateCategoryImage,
);
router.post(
  "/category/:category/remove-image",
  adminAuth,
  extraController.clearCategoryImage,
);

module.exports = router;

