const express = require("express");
const router = express.Router();
const podController = require("../controllers/podController");
const { adminAuth } = require("../middleware/auth");

// public listing
router.get("/", podController.listPods);
router.get("/:id", podController.getPod);

// admin
router.post("/", adminAuth, podController.createPod);
router.put("/:id", adminAuth, podController.updatePod);

module.exports = router;
