const express = require("express");
const router = express.Router();
const podController = require("../controllers/podController");
const { adminAuth } = require("../middleware/auth");
const uploadService = require("../services/uploadService");

// public listing
router.get("/", podController.listPods);
router.get("/:id", podController.getPod);

// admin - create pod with images (multipart form)
router.post(
    "/",
    adminAuth,
    uploadService.uploaders.pods.array("images", 10),
    podController.createPod
);

// admin - update pod with optional new images
router.put(
    "/:id",
    adminAuth,
    uploadService.uploaders.pods.array("images", 10),
    podController.updatePod
);

// Pod image management (admin)
router.put("/:id/delete", adminAuth, podController.softDeletePod);
router.put("/:id/restore", adminAuth, podController.restorePod);

router.post(
    "/:podId/images",
    adminAuth,
    uploadService.uploaders.pods.array("images", 10),
    podController.addPodImages
);
router.delete("/images/:imageId", adminAuth, podController.deletePodImage);
router.put("/images/:imageId/primary", adminAuth, podController.setPrimaryImage);
router.put("/:podId/images/reorder", adminAuth, podController.reorderImages);

module.exports = router;
